import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CBC_SCOUT } from './scoutIdentity.ts';

test('tracking and settings stay under the keys counters already have saved', () => {
  assert.equal(CBC_SCOUT.trackingStorageKey, 'cbc_scout_tracking');
  assert.equal(CBC_SCOUT.settingsStorageKey, 'cbc_scout_settings');
});
