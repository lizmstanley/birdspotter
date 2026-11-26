import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ebirdChecklistUrl,
  fetchHotspotsInCircle,
  fetchRecentNotableSightingsInCircle,
  fetchRecentSightingsInCircle,
  isConfirmedReport,
  isSendableEbirdKey,
  recentNotableSightingsUrl,
  recentSightingsUrl,
} from './ebird.ts';
import { forgetRecentCopies } from './ebirdCache.ts';
import {
  EbirdKeyRejectedError,
  EbirdKeyUnsendableError,
  EbirdRequestError,
  EbirdUnreachableError,
  UnexpectedResponseError,
} from './errors.ts';
import { FETCH_TIMEOUT_MS } from './http.ts';

const RADIUS_MILES = 7.5;

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

let storage: MemoryStorage;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('a rejected key is reported as a key problem for both requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Forbidden', { status: 403 }));

  await assert.rejects(
    fetchHotspotsInCircle('bad-key', 44.8, -93.3, RADIUS_MILES),
    (err) => err instanceof EbirdKeyRejectedError && err.endpoint === 'hotspots'
  );
  await assert.rejects(
    fetchRecentSightingsInCircle('bad-key', 44.8, -93.3, RADIUS_MILES),
    (err) => err instanceof EbirdKeyRejectedError && err.endpoint === 'sightings'
  );
});

test('a key with a character a header cannot carry fails as a key problem before any request, even with a saved copy', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));
  await fetchHotspotsInCircle('good-key', 44.8, -93.3, RADIUS_MILES);
  fetchMock.mock.resetCalls();

  await assert.rejects(fetchHotspotsInCircle('bad\u2019key', 44.8, -93.3, RADIUS_MILES), EbirdKeyUnsendableError);
  await assert.rejects(fetchRecentSightingsInCircle('bad\nkey', 44.8, -93.3, RADIUS_MILES), EbirdKeyUnsendableError);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('a key is sent trimmed, and a Latin-1 character such as é is sent as is', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('  cl\u00e9 \n', 44.8, -93.3, RADIUS_MILES);
  const init = fetchMock.mock.calls[0]?.arguments[1] as RequestInit | undefined;
  assert.equal(new Headers(init?.headers).get('X-eBirdApiToken'), 'cl\u00e9');
});

test('the key check accepts what a header can carry and refuses the rest', () => {
  assert.equal(isSendableEbirdKey('abc123'), true);
  assert.equal(isSendableEbirdKey(' cl\u00e9\t'), true);
  assert.equal(isSendableEbirdKey('abc\u2019'), false);
  assert.equal(isSendableEbirdKey('ab\0c'), false);
  assert.equal(isSendableEbirdKey('ab\rc'), false);
});

test('any other failed request keeps its status and response text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('down for maintenance', { status: 503 }));

  await assert.rejects(
    fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES),
    (err) =>
      err instanceof EbirdRequestError &&
      err.status === 503 &&
      err.responseText === 'down for maintenance'
  );
  await assert.rejects(
    fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES),
    (err) => err instanceof EbirdRequestError && err.endpoint === 'sightings' && err.status === 503
  );
});

const HOTSPOT = { locId: 'L1', locName: 'Lake Harriet', lat: 44.92, lng: -93.31, numSpeciesAllTime: 210 };
const SIGHTING = {
  speciesCode: 'bkcchi',
  comName: 'Black-capped Chickadee',
  sciName: 'Poecile atricapillus',
  locId: 'L1',
  locName: 'Lake Harriet',
  obsDt: '2026-11-20 08:15',
  howMany: 4,
  lat: 44.92,
  lng: -93.31,
  subId: 'S1',
};

function respondWith(body: unknown) {
  return async () => Response.json(body);
}

test('well-formed hotspots and sightings come back as sent', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.deepEqual((await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [SIGHTING]);
});

test('notable sightings come from the notable endpoint with simple detail, unreviewed reports, and the same day limits', () => {
  const url = new URL(recentNotableSightingsUrl(44.8, -93.3, 15, 45));
  assert.equal(url.pathname, '/v2/data/obs/geo/recent/notable');
  assert.equal(url.searchParams.get('detail'), 'simple');
  assert.equal(url.searchParams.get('includeProvisional'), 'true');
  assert.equal(url.searchParams.get('back'), '30');
  assert.equal(url.searchParams.get('dist'), new URL(recentSightingsUrl(44.8, -93.3, 15)).searchParams.get('dist'));
  assert.equal(new URL(recentNotableSightingsUrl(44.8, -93.3, 15, 0)).searchParams.get('back'), '1');
});

test('a report is confirmed only when eBird marks it valid', () => {
  assert.equal(isConfirmedReport({ ...SIGHTING, obsValid: true }), true);
  assert.equal(isConfirmedReport({ ...SIGHTING, obsValid: false }), false);
  assert.equal(isConfirmedReport(SIGHTING), false);
});

test('a sighting with a review status comes back with it, and one with a status that is not true or false is rejected', async (t) => {
  const confirmed = { ...SIGHTING, obsValid: true };
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([confirmed]));
  assert.deepEqual((await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [confirmed]);

  fetchMock.mock.mockImplementation(respondWith([{ ...SIGHTING, obsValid: 'true' }]));
  await assert.rejects(
    fetchRecentNotableSightingsInCircle('key', 44.9, -93.3, RADIUS_MILES),
    (err) => err instanceof UnexpectedResponseError && err.endpoint === 'notable sightings'
  );
});

test('a checklist link encodes the checklist id', () => {
  assert.equal(ebirdChecklistUrl('S123'), 'https://ebird.org/checklist/S123');
  assert.equal(ebirdChecklistUrl('S1/../x'), 'https://ebird.org/checklist/S1%2F..%2Fx');
});

test('notable sightings are checked like regular sightings and name their request on failure', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  assert.deepEqual((await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [SIGHTING]);
  assert.match(String(fetchMock.mock.calls[0]?.arguments[0]), /\/recent\/notable\?/);

  fetchMock.mock.mockImplementation(respondWith([{ ...SIGHTING, subId: undefined }]));
  await assert.rejects(
    fetchRecentNotableSightingsInCircle('key', 44.9, -93.3, RADIUS_MILES),
    (err) => err instanceof UnexpectedResponseError && err.endpoint === 'notable sightings'
  );
  fetchMock.mock.mockImplementation(async () => new Response('Forbidden', { status: 403 }));
  await assert.rejects(
    fetchRecentNotableSightingsInCircle('key', 45, -93.3, RADIUS_MILES),
    (err) => err instanceof EbirdKeyRejectedError && err.endpoint === 'notable sightings'
  );
});

test('a response that is not a list is rejected as unexpected', async (t) => {
  t.mock.method(globalThis, 'fetch', respondWith({ errors: [] }));

  await assert.rejects(
    fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES),
    (err) => err instanceof UnexpectedResponseError && err.source === 'ebird' && err.endpoint === 'hotspots'
  );
});

test('a hotspot off the globe or a sighting missing a field is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [{ ...HOTSPOT, lat: 95 }] : [{ ...SIGHTING, subId: undefined }])
  );

  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES), UnexpectedResponseError);
  await assert.rejects(
    fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES),
    (err) => err instanceof UnexpectedResponseError && err.endpoint === 'sightings'
  );
});

test('both requests give up after the shared fetch timeout', async (t) => {
  const timeout = t.mock.method(AbortSignal, 'timeout', () =>
    AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))
  );
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    init.signal?.throwIfAborted();
    return Response.json([]);
  });

  const timedOut = (err: unknown) =>
    err instanceof EbirdUnreachableError && err.cause instanceof DOMException && err.cause.name === 'TimeoutError';
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES), timedOut);
  await assert.rejects(fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES), timedOut);
  assert.deepEqual(
    timeout.mock.calls.map((call) => call.arguments[0]),
    [FETCH_TIMEOUT_MS, FETCH_TIMEOUT_MS]
  );
});

function noSignal(): Promise<Response> {
  return Promise.reject(new TypeError('Failed to fetch'));
}

test('with no signal, a saved copy older than the caller allows is used, up to 6 hours old, with its fetch time', async (t) => {
  const halfHour = 30 * 60 * 1000;
  const savedAt = new Date(2026, 10, 20, 9, 0).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: savedAt });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );
  await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);
  await fetchHotspotsInCircle('key', 44.8, -93.3, 15, halfHour);

  fetchMock.mock.mockImplementation(noSignal);
  t.mock.timers.setTime(new Date(2026, 10, 20, 14, 59).getTime());
  assert.deepEqual(await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour), {
    items: [SIGHTING],
    fetchedAt: savedAt,
    isNoSignalCopy: true,
  });
  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3, 15, halfHour), {
    items: [HOTSPOT],
    fetchedAt: savedAt,
    isNoSignalCopy: true,
  });
});

test('with no signal, a saved sightings or hotspots copy 6 hours old is not used', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);

  fetchMock.mock.mockImplementation(noSignal);
  t.mock.timers.setTime(new Date(2026, 10, 20, 15, 0).getTime());
  const sixHours = 6 * 60 * 60 * 1000;
  await assert.rejects(
    fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000),
    (err) => err instanceof EbirdUnreachableError && err.endpoint === 'sightings' && err.cause instanceof TypeError
  );
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3, 15, sixHours), EbirdUnreachableError);
});

test('with no signal after midnight, a copy saved late the evening before is used, up to 6 hours old', async (t) => {
  const savedAt = new Date(2026, 11, 19, 23, 0).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: savedAt });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);

  fetchMock.mock.mockImplementation(noSignal);
  t.mock.timers.setTime(new Date(2026, 11, 20, 0, 30).getTime());
  const reopened = await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);
  assert.deepEqual(reopened, { items: [SIGHTING], fetchedAt: savedAt, isNoSignalCopy: true });

  t.mock.timers.setTime(new Date(2026, 11, 20, 5, 0).getTime());
  await assert.rejects(fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdUnreachableError);
});

test('with no signal while the response body arrives, a saved copy is used', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);

  const stalledBody = {
    status: 200,
    ok: true,
    json: () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
  } as unknown as Response;
  fetchMock.mock.mockImplementation(async () => stalledBody);
  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 0).getTime());
  const result = await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);
  assert.equal(result.isNoSignalCopy, true);
});

test('after eBird rejects the key, no signal does not bring back a copy saved under the earlier key', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('good-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);

  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 0).getTime());
  fetchMock.mock.mockImplementation(async () => new Response('Forbidden', { status: 403 }));
  await assert.rejects(fetchRecentSightingsInCircle('bad-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdKeyRejectedError);
  fetchMock.mock.mockImplementation(noSignal);
  await assert.rejects(fetchRecentSightingsInCircle('bad-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdUnreachableError);
});

test('after eBird rejects the key past midnight, no signal does not bring back the evening copy', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 11, 19, 23, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('good-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);

  t.mock.timers.setTime(new Date(2026, 11, 20, 0, 30).getTime());
  fetchMock.mock.mockImplementation(async () => new Response('Forbidden', { status: 403 }));
  await assert.rejects(fetchRecentSightingsInCircle('bad-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdKeyRejectedError);
  fetchMock.mock.mockImplementation(noSignal);
  await assert.rejects(fetchRecentSightingsInCircle('bad-key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdUnreachableError);
});

test('an eBird error response does not fall back to a saved copy', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);

  fetchMock.mock.mockImplementation(async () => new Response('down', { status: 503 }));
  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 0).getTime());
  await assert.rejects(fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000), EbirdRequestError);
});

test('a fresh response and a saved copy each carry when eBird sent them', async (t) => {
  const firstFetch = new Date(2026, 10, 20, 9, 0).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: firstFetch });
  t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));

  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES), {
    items: [HOTSPOT],
    fetchedAt: firstFetch,
    isNoSignalCopy: false,
  });
  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 0).getTime());
  assert.equal((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).fetchedAt, firstFetch);
});

test('the same hotspot request is fetched once per local day and again the next day', async (t) => {
  // A zone off UTC, so a cache keyed on the UTC date fails here as it would for a user in Minnesota.
  const realTimeZone = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  t.after(() => {
    if (realTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = realTimeZone;
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  t.mock.timers.setTime(new Date(2026, 10, 20, 23, 59).getTime());
  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 1);

  t.mock.timers.setTime(new Date(2026, 10, 21, 0, 1).getTime());
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(storage.length, 1);
});

test('a different place, radius, or day range is its own request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 14);
  await fetchRecentSightingsInCircle('key', 44.9, -93.3, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.4, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 10, 7);
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  assert.equal(fetchMock.mock.callCount(), 6);
});

test('forgetting a saved copy fetches that request again and keeps the others', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  forgetRecentCopies(recentSightingsUrl(44.8, -93.3, RADIUS_MILES));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test('a failed or malformed response is not saved', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES), EbirdRequestError);
  assert.equal(storage.length, 0);

  fetchMock.mock.mockImplementation(respondWith([{ ...HOTSPOT, lat: 95 }]));
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES), UnexpectedResponseError);
  assert.equal(storage.length, 0);
});

test('a saved copy that no longer validates is fetched again', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  storage.setItem(storage.key(0) ?? '', '[{"locId":1}]');

  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('requests still work when the browser blocks storage', async (t) => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new DOMException('blocked', 'SecurityError');
    },
    configurable: true,
  });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));

  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('a saved copy is used until it reaches the given age, then fetched again', async (t) => {
  const halfHour = 30 * 60 * 1000;
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);
  await fetchHotspotsInCircle('key', 44.8, -93.3, 15, halfHour);
  t.mock.timers.setTime(new Date(2026, 10, 20, 9, 29).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);
  await fetchHotspotsInCircle('key', 44.8, -93.3, 15, halfHour);
  assert.equal(fetchMock.mock.callCount(), 2);

  t.mock.timers.setTime(new Date(2026, 10, 20, 9, 30).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);
  await fetchHotspotsInCircle('key', 44.8, -93.3, 15, halfHour);
  assert.equal(fetchMock.mock.callCount(), 4);
});

test('a copy too old for one caller is still used by a caller with no age limit', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 0).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, 30 * 60 * 1000);
  t.mock.timers.setTime(new Date(2026, 10, 20, 10, 30).getTime());
  assert.deepEqual((await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [SIGHTING]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('saved sightings and notable sightings are used for 6 hours at most, whatever age the caller allows', async (t) => {
  const day = 24 * 60 * 60 * 1000;
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, 15, 7, day);
  t.mock.timers.setTime(new Date(2026, 10, 20, 14, 59).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, 15, 7, day);
  assert.equal(fetchMock.mock.callCount(), 2);

  t.mock.timers.setTime(new Date(2026, 10, 20, 15, 0).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, 15, 7, day);
  assert.equal(fetchMock.mock.callCount(), 4);
});

test('a sightings copy saved today before copies expired is used for 6 hours at most', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  const key = storage.key(0) ?? '';
  storage.setItem(key, JSON.stringify({ savedAt: Date.now(), items: [SIGHTING] }));

  t.mock.timers.setTime(new Date(2026, 10, 20, 15, 0).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('saving any request removes expired sightings copies and keeps hotspots for the day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchRecentNotableSightingsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);

  t.mock.timers.setTime(new Date(2026, 10, 20, 15, 0).getTime());
  await fetchHotspotsInCircle('key', 44.9, -93.3, RADIUS_MILES);
  const saved = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '');
  assert.equal(saved.length, 2);
  assert.ok(saved.every((key) => key.includes('/hotspot/')));
});

test('a save just past midnight keeps the evening hotspots for a restart with no signal', async (t) => {
  const halfHour = 30 * 60 * 1000;
  const sixHours = 6 * 60 * 60 * 1000;
  const eveningFetch = new Date(2026, 11, 19, 22, 0).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: eveningFetch });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);
  await fetchHotspotsInCircle('key', 44.8, -93.3, 15, sixHours);

  const midnightFetch = new Date(2026, 11, 20, 0, 10).getTime();
  t.mock.timers.setTime(midnightFetch);
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour);

  fetchMock.mock.mockImplementation(noSignal);
  t.mock.timers.setTime(new Date(2026, 11, 20, 0, 30).getTime());
  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3, 15, sixHours), {
    items: [HOTSPOT],
    fetchedAt: eveningFetch,
    isNoSignalCopy: true,
  });
  assert.equal((await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7, halfHour)).fetchedAt, midnightFetch);
});

test('saving drops copies from the day before once 6 hours old or invalid, and every copy from earlier days', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 11, 18, 23, 0) });
  t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));
  await fetchHotspotsInCircle('key', 44.7, -93.3, RADIUS_MILES);
  t.mock.timers.setTime(new Date(2026, 11, 19, 21, 0).getTime());
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  t.mock.timers.setTime(new Date(2026, 11, 19, 22, 0).getTime());
  await fetchHotspotsInCircle('key', 44.9, -93.3, RADIUS_MILES);

  const recentCopy = JSON.stringify({ savedAt: new Date(2026, 11, 20, 3, 0).getTime(), items: [HOTSPOT] });
  storage.setItem('cbc_ebird_cache:2026-12-18:moved-clock', recentCopy);
  storage.setItem('cbc_ebird_cache:2026-12-19:bare-list', JSON.stringify([HOTSPOT]));

  t.mock.timers.setTime(new Date(2026, 11, 20, 3, 30).getTime());
  await fetchHotspotsInCircle('key', 45.0, -93.3, RADIUS_MILES);
  const saved = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? '').sort();
  assert.equal(saved.length, 2);
  assert.match(saved[0] ?? '', /^cbc_ebird_cache:2026-12-19:.*lat=44\.9/);
  assert.match(saved[1] ?? '', /^cbc_ebird_cache:2026-12-20:.*lat=45/);
});

test('a copy saved as a bare list, with no saved time, is fetched again', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));
  await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES);
  storage.setItem(storage.key(0) ?? '', JSON.stringify([HOTSPOT]));

  assert.deepEqual((await fetchHotspotsInCircle('key', 44.8, -93.3, RADIUS_MILES)).items, [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 2);
});
