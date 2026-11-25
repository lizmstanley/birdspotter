import type { BirdingApp } from '@birdspotter/birding-core/birdingApp.ts';

/** Birders' phones keep state under these keys, so renaming one loses it. */
export const LETS_GO_BIRDING: BirdingApp = {
  name: "Let's Go Birding",
  trackingStorageKey: 'lgb_tracking',
  settingsStorageKey: 'lgb_settings',
};
