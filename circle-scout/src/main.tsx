import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { requestPersistentStorage } from '../../src/services/autoSave.ts';
import { startSavedAreas, takeAreaLinkFromAddress } from './areaStartup.ts';
import { CircleScoutApp } from './CircleScoutApp.tsx';
import { isRunningInstalled } from './installOffer.ts';
import { watchInstallPrompt } from './installPrompt.ts';
import type { AreaStorage } from './savedAreas.ts';
import './scout.css';

const SCOUT_PATH = `${import.meta.env.BASE_URL}circle-scout/`;

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Scoped to Circle Scout's folder so the web app never comes under it.
  navigator.serviceWorker.register(`${SCOUT_PATH}sw.js`, { scope: SCOUT_PATH }).catch((err: unknown) => {
    // The app still works online without it; only Chrome's install offer depends on it.
    console.warn('Circle Scout: service worker registration failed', err);
  });
}

function scoutStorage(): AreaStorage | null {
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
    <CircleScoutApp installPrompt={installPrompt} areaStartup={areaStartup} storage={storage} />
  </StrictMode>
);
