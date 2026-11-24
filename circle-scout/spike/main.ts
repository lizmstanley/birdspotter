import 'maplibre-gl/dist/maplibre-gl.css';
import './spike.css';
import { requestPersistentStorage } from '../../src/services/autoSave.ts';
import { describeError } from '../../src/services/describeError.ts';
import { setUpEbirdCheck } from './ebirdCheck.ts';
import { startLiveLocation } from './liveLocation.ts';
import { createOutlineDrawer, createSpikeMap } from './outlineMap.ts';
import { setUpQrMake } from './qrMake.ts';
import { setUpQrRead } from './qrRead.ts';
import { byId, showStatus } from './readout.ts';
import { setUpScreenWakeLock } from './screenWakeLock.ts';

const SPIKE_PATH = `${import.meta.env.BASE_URL}circle-scout/spike/`;

async function registerServiceWorker(statusEl: HTMLElement): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    statusEl.textContent = 'Service worker: not supported by this browser.';
    return;
  }
  try {
    // Scoped to this page's folder so the main app never comes under it.
    await navigator.serviceWorker.register(`${SPIKE_PATH}sw.js`, { scope: SPIKE_PATH });
    statusEl.textContent = 'Service worker: registered.';
  } catch (err) {
    statusEl.textContent = `Service worker: registration failed: ${describeError(err)}`;
  }
}

async function showStorageStatus(statusEl: HTMLElement): Promise<void> {
  const isPersistent = await requestPersistentStorage();
  if (isPersistent) return showStatus(statusEl, 'pass', 'Persistent storage granted.');
  showStatus(statusEl, 'fail', 'Persistent storage not granted. The browser may clear this page’s data.');
}

function start(): void {
  const pageUrl = location.origin + location.pathname;
  const spikeMap = createSpikeMap(byId('map', HTMLDivElement));
  const latestFix = startLiveLocation(spikeMap.map, byId('location-status', HTMLParagraphElement));

  setUpScreenWakeLock(byId('wake-toggle', HTMLButtonElement), byId('wake-status', HTMLParagraphElement));
  setUpEbirdCheck(
    {
      keyInput: byId('ebird-key', HTMLInputElement),
      saveButton: byId('ebird-save', HTMLButtonElement),
      loadButton: byId('ebird-load', HTMLButtonElement),
      savedEl: byId('ebird-saved', HTMLParagraphElement),
      statusEl: byId('ebird-status', HTMLParagraphElement),
    },
    latestFix
  );
  setUpQrMake(
    {
      fileInput: byId('outline-file', HTMLInputElement),
      outlinePick: byId('outline-pick', HTMLSelectElement),
      canvas: byId('qr-canvas', HTMLCanvasElement),
      link: byId('qr-link', HTMLAnchorElement),
      statusEl: byId('qr-make-status', HTMLParagraphElement),
    },
    pageUrl
  );
  setUpQrRead(
    {
      startButton: byId('scan-start', HTMLButtonElement),
      stopButton: byId('scan-stop', HTMLButtonElement),
      video: byId('scan-video', HTMLVideoElement),
      openedAsEl: byId('opened-as', HTMLParagraphElement),
      statusEl: byId('qr-read-status', HTMLParagraphElement),
    },
    pageUrl,
    createOutlineDrawer(spikeMap)
  );

  const storageStatus = byId('storage-status', HTMLParagraphElement);
  showStatus(storageStatus, 'waiting', 'Asking the browser to keep this page’s data.');
  void showStorageStatus(storageStatus);
  void registerServiceWorker(byId('sw-status', HTMLParagraphElement));
}

start();
