import type { BirdingApp } from '@birdspotter/birding-core/birdingApp.ts';

/** Counters' phones already hold state under these keys, so renaming one loses it. */
export const CBC_SCOUT: BirdingApp = {
  name: 'CBC Scout',
  trackingStorageKey: 'cbc_scout_tracking',
  settingsStorageKey: 'cbc_scout_settings',
};
