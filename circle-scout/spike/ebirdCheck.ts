import { fetchRecentSightingsInCircle, recentSightingsUrl } from '../../src/services/ebird.ts';
import { forgetTodaysCopy } from '../../src/services/ebirdCache.ts';
import { CBC_CIRCLE_RADIUS_MILES } from '../../src/services/cbcCircle.ts';
import { describeError } from '../../src/services/describeError.ts';
import { requestFix, type Fix } from './liveLocation.ts';
import { showStatus } from './readout.ts';

// Separate from the main app's key so a pass proves this page saved and reread its own key.
const EBIRD_KEY_STORAGE = 'circle_scout_spike_ebird_key';

interface EbirdCheckElements {
  readonly keyInput: HTMLInputElement;
  readonly saveButton: HTMLButtonElement;
  readonly loadButton: HTMLButtonElement;
  readonly savedEl: HTMLElement;
  readonly statusEl: HTMLElement;
}

function readSavedKey(): string {
  try {
    return localStorage.getItem(EBIRD_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function saveKey(key: string): boolean {
  try {
    localStorage.setItem(EBIRD_KEY_STORAGE, key);
    return true;
  } catch {
    return false;
  }
}

export function setUpEbirdCheck(els: EbirdCheckElements, latestFix: () => Fix | null): void {
  const keyAtOpen = readSavedKey();
  els.keyInput.value = keyAtOpen;
  els.savedEl.textContent = keyAtOpen
    ? 'A saved key was found when this page opened.'
    : 'No saved key when this page opened.';
  showStatus(els.statusEl, 'waiting', 'Save a key, then load sightings.');

  els.saveButton.addEventListener('click', () => {
    const key = els.keyInput.value.trim();
    if (!key) return showStatus(els.statusEl, 'fail', 'Enter a key first.');
    if (!saveKey(key)) return showStatus(els.statusEl, 'fail', 'This browser blocked saving the key.');
    showStatus(els.statusEl, 'waiting', 'Key saved. Close the app, reopen it, and check the line above.');
  });

  els.loadButton.addEventListener('click', async () => {
    const key = els.keyInput.value.trim();
    if (!key) return showStatus(els.statusEl, 'fail', 'Enter a key first.');
    showStatus(els.statusEl, 'waiting', 'Loading sightings...');
    try {
      const fix = latestFix() ?? (await requestFix());
      // A saved copy would pass without reaching eBird, so every tap goes to the network.
      forgetTodaysCopy(recentSightingsUrl(fix.lat, fix.lng));
      const sightings = await fetchRecentSightingsInCircle(key, fix.lat, fix.lng);
      showStatus(
        els.statusEl,
        'pass',
        `${sightings.length} sightings in the last 7 days within ${CBC_CIRCLE_RADIUS_MILES} miles.`
      );
    } catch (err) {
      showStatus(els.statusEl, 'fail', describeError(err));
    }
  });
}
