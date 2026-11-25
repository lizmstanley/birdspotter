import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { watchInstallPrompt } from '@birdspotter/birding-core/installPrompt.ts';
import { requestPersistentStorage } from '@birdspotter/birding-core/persistentStorage.ts';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import '@birdspotter/birding-core/birding.css';
import { LetsGoBirdingApp } from './LetsGoBirdingApp.tsx';
// After the core styles, so the app's rules win a tie.
import './lgb.css';

const APP_PATH = `${import.meta.env.BASE_URL}lets-go-birding/`;

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Scoped to this app's folder so the web app and CBC Scout never come under it.
  navigator.serviceWorker.register(`${APP_PATH}sw.js`, { scope: APP_PATH }).catch((err: unknown) => {
    // The app still works online without it; only Chrome's install offer depends on it.
    console.warn("Let's Go Birding: service worker registration failed", err);
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
    <LetsGoBirdingApp installPrompt={installPrompt} storage={appStorage()} />
  </StrictMode>
);
