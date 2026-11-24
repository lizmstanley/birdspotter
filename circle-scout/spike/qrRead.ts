import jsQR from 'jsqr';
import { describeError } from '../../src/services/describeError.ts';
import { countPoints, decodeOutline, InvalidOutlineLinkError, type Outline } from './outlinePayload.ts';
import { canvasContext, showStatus } from './readout.ts';

interface QrReadElements {
  readonly startButton: HTMLButtonElement;
  readonly stopButton: HTMLButtonElement;
  readonly video: HTMLVideoElement;
  readonly openedAsEl: HTMLElement;
  readonly statusEl: HTMLElement;
}

const SCAN_TIMEOUT_MS = 120_000;
// Dense codes need enough pixels per module; larger frames cost more time per decode.
const SCAN_MAX_WIDTH_PX = 1280;
const SHOWN_TEXT_CHARS = 60;

function isInstalledApp(): boolean {
  // iOS home-screen apps report through navigator.standalone, which is not in the DOM types.
  return matchMedia('(display-mode: standalone)').matches || Reflect.get(navigator, 'standalone') === true;
}

function openedAsText(): string {
  return isInstalledApp() ? 'installed app' : 'browser tab';
}

/** @returns the outline payload, or null when the text is not a link to this page with data after `#` */
function payloadFromLink(text: string, pageUrl: string): string | null {
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  if (url.origin + url.pathname !== pageUrl || url.hash.length < 2) return null;
  return url.hash.slice(1);
}

export function setUpQrRead(
  els: QrReadElements,
  pageUrl: string,
  drawOutline: (outline: Outline) => Promise<void>
): void {
  const frameCanvas = document.createElement('canvas');
  let stream: MediaStream | null = null;
  let frameRequest = 0;
  let startedAt = 0;

  async function showOutline(payload: string, source: string): Promise<void> {
    try {
      const outline = decodeOutline(payload);
      await drawOutline(outline);
      const points = countPoints(outline.geometry);
      showStatus(
        els.statusEl,
        'pass',
        `${source}: outline drawn with ${points} points, in the ${openedAsText()}. ` +
          'Tap the location button on the map to follow you again.'
      );
    } catch (err) {
      const detail = err instanceof InvalidOutlineLinkError ? `${err.message} (${err.reason})` : describeError(err);
      showStatus(els.statusEl, 'fail', detail);
    }
  }

  function stopScan(): void {
    cancelAnimationFrame(frameRequest);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    els.video.srcObject = null;
    els.video.hidden = true;
    els.startButton.disabled = false;
    els.stopButton.disabled = true;
  }

  function readFrame(): string | null {
    const { videoWidth, videoHeight } = els.video;
    if (!videoWidth || !videoHeight) return null;
    const scale = Math.min(1, SCAN_MAX_WIDTH_PX / videoWidth);
    frameCanvas.width = Math.round(videoWidth * scale);
    frameCanvas.height = Math.round(videoHeight * scale);
    const ctx = canvasContext(frameCanvas, { willReadFrequently: true });
    ctx.drawImage(els.video, 0, 0, frameCanvas.width, frameCanvas.height);
    const image = ctx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  }

  function handleScan(text: string): void {
    const payload = payloadFromLink(text, pageUrl);
    if (payload === null) {
      return showStatus(els.statusEl, 'fail', `Code read, but not a link to this page: ${text.slice(0, SHOWN_TEXT_CHARS)}`);
    }
    void showOutline(payload, 'Scanned');
  }

  function scanFrame(): void {
    if (!stream) return;
    if (Date.now() - startedAt > SCAN_TIMEOUT_MS) {
      stopScan();
      return showStatus(els.statusEl, 'fail', 'No code found in 2 minutes.');
    }
    const text = readFrame();
    if (text === null) {
      frameRequest = requestAnimationFrame(scanFrame);
      return;
    }
    stopScan();
    handleScan(text);
  }

  async function startScan(): Promise<void> {
    els.startButton.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
        audio: false,
      });
      els.video.srcObject = stream;
      els.video.hidden = false;
      await els.video.play();
      els.stopButton.disabled = false;
      startedAt = Date.now();
      showStatus(els.statusEl, 'waiting', 'Point the camera at a code.');
      scanFrame();
    } catch (err) {
      stopScan();
      showStatus(els.statusEl, 'fail', `Camera: ${describeError(err)}`);
    }
  }

  function showLinkFromAddress(): void {
    if (location.hash.length < 2) {
      return showStatus(els.statusEl, 'waiting', 'Scan a code, or open this page from a code with the phone camera.');
    }
    void showOutline(location.hash.slice(1), 'Opened from link');
  }

  els.openedAsEl.textContent = `Opened as: ${openedAsText()}.`;
  els.startButton.addEventListener('click', () => void startScan());
  els.stopButton.addEventListener('click', () => {
    stopScan();
    showStatus(els.statusEl, 'waiting', 'Scan stopped.');
  });
  window.addEventListener('hashchange', showLinkFromAddress);
  showLinkFromAddress();
}
