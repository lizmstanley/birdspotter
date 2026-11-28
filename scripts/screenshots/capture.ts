// Retakes the install-sheet pictures listed in each phone app's manifest, from the built apps and made-up data.
// Run with `npm run screenshots`, which builds first. CHROME_PATH names the Chrome to drive; the default is
// `google-chrome` on the PATH.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { preview } from 'vite';
import { launchChrome, type CdpConnection, type CdpEvent } from './cdp.ts';
import { PHONE_POSITION, sampleEbirdAnswer, scoutStorageItems } from './sampleData.ts';

// 405 by 720 CSS pixels at 8/3 makes the 1080 by 1920 picture each manifest declares.
const PHONE_WIDTH = 405;
const PHONE_HEIGHT = 720;
const PHONE_SCALE = 8 / 3;
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const READY_POLL_MS = 250;
const READY_MAX_POLLS = 120;
// Map tiles keep arriving after the lists show; there is no page signal for the last one.
const MAP_SETTLE_MS = 5000;
const TAP_SETTLE_MS = 500;
const SECOND_FIX_OFFSET = 0.00001;
const FAKE_EBIRD_KEY = 'samplekey123';
const LOCATION_BUTTON = '.maplibregl-ctrl-geolocate:not([disabled])';
// A running count turns location on by itself, and a second tap would turn it off.
const LOCATION_OFF_BUTTON = [
  LOCATION_BUTTON,
  ':not(.maplibregl-ctrl-geolocate-waiting)',
  ':not(.maplibregl-ctrl-geolocate-active)',
  ':not(.maplibregl-ctrl-geolocate-background)',
].join('');
const MAP_CREDITS_BUTTON = '.maplibregl-compact-show .maplibregl-ctrl-attrib-button';
const MAP_ZOOM_OUT = '.maplibregl-ctrl-zoom-out';
// Turning location on zooms to the street; two steps out show the places around.
const MAP_TAPS = [MAP_CREDITS_BUTTON, MAP_ZOOM_OUT, MAP_ZOOM_OUT];

interface Shot {
  /** Repo-relative path of the picture. */
  readonly file: string;
  /** Path of the app under the preview server. */
  readonly appPath: string;
  readonly storage: ReadonlyMap<string, string>;
  /** Text that shows once location is on and the lists have loaded. */
  readonly readyText: string;
  /** CSS selectors of elements to tap, in order, once the map has settled. */
  readonly taps: readonly string[];
}

class ShotNotReadyError extends Error {
  readonly file: string;

  constructor(file: string, awaited: string) {
    super(`screenshots: ${file} never showed ${awaited}`);
    this.name = 'ShotNotReadyError';
    this.file = file;
  }
}

function shots(now: number): readonly Shot[] {
  const birdspotterStorage = new Map([['cbc_ebird_api_key', FAKE_EBIRD_KEY]]);
  const scoutStorage = (isCountRunning: boolean) =>
    new Map([['cbc_ebird_api_key', FAKE_EBIRD_KEY], ...scoutStorageItems(now, isCountRunning)]);
  return [
    {
      file: 'apps/birdspotter/public/screenshot-sightings.png',
      appPath: 'app/',
      storage: birdspotterStorage,
      readyText: 'Pileated Woodpecker',
      taps: MAP_TAPS,
    },
    {
      file: 'apps/birdspotter/public/screenshot-hotspots.png',
      appPath: 'app/',
      storage: birdspotterStorage,
      readyText: 'Cattail Marsh Boardwalk',
      taps: [...MAP_TAPS, '.birdspotter-tabs button:nth-child(2)'],
    },
    {
      file: 'apps/cbc-scout/public/screenshot-area.png',
      appPath: 'cbc/scout/',
      storage: scoutStorage(false),
      readyText: 'Pileated Woodpecker',
      taps: MAP_TAPS,
    },
    {
      file: 'apps/cbc-scout/public/screenshot-count.png',
      appPath: 'cbc/scout/',
      storage: scoutStorage(true),
      readyText: 'Count running',
      taps: MAP_TAPS,
    },
  ];
}

function answerEbird(cdp: CdpConnection, sessionId: string, now: number): (event: CdpEvent) => void {
  return (event) => {
    if (event.method !== 'Fetch.requestPaused' || event.sessionId !== sessionId) return;
    const request = event.params.request as { url: string; method: string };
    const isPreflight = request.method === 'OPTIONS';
    const body = isPreflight ? '' : JSON.stringify(sampleEbirdAnswer(new URL(request.url), now));
    void cdp.send(
      'Fetch.fulfillRequest',
      {
        requestId: event.params.requestId,
        responseCode: isPreflight ? 204 : 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: 'X-eBirdApiToken' },
        ],
        body: Buffer.from(body).toString('base64'),
      },
      sessionId
    );
  };
}

async function evaluate(cdp: CdpConnection, sessionId: string, expression: string): Promise<unknown> {
  const { result } = (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)) as {
    result: { value?: unknown };
  };
  return result.value;
}

async function waitFor(cdp: CdpConnection, sessionId: string, shot: Shot, expression: string): Promise<void> {
  for (let poll = 0; poll < READY_MAX_POLLS; poll++) {
    if ((await evaluate(cdp, sessionId, expression)) === true) return;
    await sleep(READY_POLL_MS);
  }
  throw new ShotNotReadyError(shot.file, expression);
}

/** @param offset degrees added to the latitude */
async function setPosition(cdp: CdpConnection, sessionId: string, offset: number): Promise<void> {
  await cdp.send(
    'Emulation.setGeolocationOverride',
    { longitude: PHONE_POSITION[0], latitude: PHONE_POSITION[1] + offset, accuracy: 10 },
    sessionId
  );
}

async function setUpPhone(cdp: CdpConnection, sessionId: string, contextId: string, origin: string): Promise<void> {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: PHONE_WIDTH, height: PHONE_HEIGHT, deviceScaleFactor: PHONE_SCALE, mobile: true },
    sessionId
  );
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: ANDROID_CHROME_UA }, sessionId);
  await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' }, sessionId);
  // Standalone, as an installed app opens, so the page shows no install offer.
  await cdp.send(
    'Emulation.setEmulatedMedia',
    {
      features: [
        { name: 'display-mode', value: 'standalone' },
        { name: 'prefers-color-scheme', value: 'light' },
      ],
    },
    sessionId
  );
  await setPosition(cdp, sessionId, 0);
  await cdp.send('Browser.grantPermissions', {
    origin,
    permissions: ['geolocation', 'wakeLockScreen'],
    browserContextId: contextId,
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.ebird.org/*' }] }, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
}

async function tap(cdp: CdpConnection, sessionId: string, selector: string): Promise<void> {
  await evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)})?.click()`);
  await sleep(TAP_SETTLE_MS);
}

async function takeShot(cdp: CdpConnection, siteUrl: URL, shot: Shot, now: number): Promise<void> {
  const { browserContextId } = (await cdp.send('Target.createBrowserContext')) as { browserContextId: string };
  const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })) as {
    targetId: string;
  };
  const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
  const stopAnswering = cdp.onEvent(answerEbird(cdp, sessionId, now));
  try {
    await setUpPhone(cdp, sessionId, browserContextId, siteUrl.origin);
    const seed = [...shot.storage]
      .map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
      .join('');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seed }, sessionId);
    await cdp.send('Page.navigate', { url: new URL(shot.appPath, siteUrl).href }, sessionId);
    // Location goes on once the map has placed the area, as a person taps it, so the two camera moves do not race.
    await waitFor(cdp, sessionId, shot, `document.querySelector(${JSON.stringify(LOCATION_BUTTON)}) !== null`);
    await sleep(MAP_SETTLE_MS);
    await tap(cdp, sessionId, LOCATION_OFF_BUTTON);
    // A phone keeps sending fixes, and the app counts location as on from the next one; headless Chrome sends one
    // per position, so a second fix about a meter away stands in for the phone's next.
    await setPosition(cdp, sessionId, SECOND_FIX_OFFSET);
    await waitFor(cdp, sessionId, shot, `document.body.innerText.includes(${JSON.stringify(shot.readyText)})`);
    await sleep(MAP_SETTLE_MS);
    for (const selector of shot.taps) await tap(cdp, sessionId, selector);
    await sleep(MAP_SETTLE_MS);
    const { data } = (await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)) as { data: string };
    await writeFile(fileURLToPath(new URL(`../../${shot.file}`, import.meta.url)), Buffer.from(data, 'base64'));
    console.log(`wrote ${shot.file}`);
  } finally {
    stopAnswering();
    await cdp.send('Target.disposeBrowserContext', { browserContextId });
  }
}

async function main(): Promise<void> {
  const server = await preview({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    mode: 'site',
    preview: { port: 4179, strictPort: false, open: false },
  });
  const siteUrl = new URL(server.resolvedUrls?.local[0] ?? 'http://localhost:4179/');
  const chrome = await launchChrome(process.env.CHROME_PATH ?? 'google-chrome');
  try {
    const now = Date.now();
    for (const shot of shots(now)) await takeShot(chrome.cdp, siteUrl, shot, now);
  } finally {
    await chrome.close();
    await server.close();
  }
}

await main();
