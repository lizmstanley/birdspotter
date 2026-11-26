import type { BirdingApp } from '@birdspotter/birding-core/birdingApp.ts';

/** Birders' phones keep state under these keys, so renaming one loses it. */
export const BIRDSPOTTER: BirdingApp = {
  name: 'Birdspotter',
  trackingStorageKey: 'lgb_tracking',
  settingsStorageKey: 'lgb_settings',
};
