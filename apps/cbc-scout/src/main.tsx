import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { isRunningInstalled } from '@birdspotter/birding-core/installOffer.ts';
import { watchInstallPrompt } from '@birdspotter/birding-core/installPrompt.ts';
import { requestPersistentStorage } from '@birdspotter/birding-core/persistentStorage.ts';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import '@birdspotter/birding-core/birding.css';
import { startSavedAreas, takeAreaLinkFromAddress } from './areaStartup.ts';
import { CbcScoutApp } from './CbcScoutApp.tsx';
// After the core styles, so the app's rules win a tie.
import './scout.css';

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Scoped to CBC Scout's folder so the circle manager and Birdspotter never come under it.
  const scoutPath = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(`${scoutPath}sw.js`, { scope: scoutPath }).catch((err: unknown) => {
    // The app still works online without it; only Chrome's install offer depends on it.
    console.warn('CBC Scout: service worker registration failed', err);
  });
}

function scoutStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Some browsers throw on access when site storage is blocked; areas then last only until the app closes.
    return null;
  }
}

const installPrompt = watchInstallPrompt(window);
// Chrome grants this only once installed, so a denial in a browser tab is expected and not shown.
void requestPersistentStorage();
registerServiceWorker();
const storage = scoutStorage();
// Read before React renders so a StrictMode double render cannot load the link twice or miss it.
const areaStartup = startSavedAreas(storage, takeAreaLinkFromAddress(window), isRunningInstalled(window));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CbcScoutApp installPrompt={installPrompt} areaStartup={areaStartup} storage={storage} />
  </StrictMode>
);
