import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { watchInstallPrompt } from '@birdspotter/birding-core/installPrompt.ts';
import { requestPersistentStorage } from '@birdspotter/birding-core/persistentStorage.ts';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import '@birdspotter/birding-core/birding.css';
import { BirdspotterApp } from './BirdspotterApp.tsx';
// After the core styles, so the app's rules win a tie.
import './birdspotter.css';

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Scoped to this app's folder so the CBC apps never come under it.
  const appPath = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(`${appPath}sw.js`, { scope: appPath }).catch((err: unknown) => {
    // The app still works online without it; opening with no signal and Chrome's install offer depend on it.
    console.warn('Birdspotter: service worker registration failed', err);
  });
}

function appStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Some browsers throw on access when site storage is blocked; settings then last only until the app closes.
    return null;
  }
}

const installPrompt = watchInstallPrompt(window);
// Chrome grants this only once installed, so a denial in a browser tab is expected and not shown.
void requestPersistentStorage();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BirdspotterApp installPrompt={installPrompt} storage={appStorage()} />
  </StrictMode>
);
