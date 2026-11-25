import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScoutSettings, SETTINGS_STORAGE_KEY, writeScoutSettings } from './scoutSettings.ts';
import { MemoryStorage } from './testing/areaFixtures.ts';

test('saved settings come back on the next start', () => {
  const storage = new MemoryStorage();
  assert.equal(writeScoutSettings(storage, { refreshMinutes: 15 }), true);
  assert.deepEqual(readScoutSettings(storage), { refreshMinutes: 15 });
});

test('with nothing saved the list refreshes every half hour', () => {
  assert.deepEqual(readScoutSettings(new MemoryStorage()), { refreshMinutes: 30 });
  assert.deepEqual(readScoutSettings(null), { refreshMinutes: 30 });
});

for (const [label, text] of [
  ['an interval that is not a choice', '{"refreshMinutes":5}'],
  ['an interval saved as text', '{"refreshMinutes":"15"}'],
  ['a value that is not an object', '15'],
  ['text that is not JSON', '{refreshMinutes'],
] as const) {
  test(`${label} falls back to every half hour`, () => {
    const storage = new MemoryStorage();
    storage.items.set(SETTINGS_STORAGE_KEY, text);
    assert.deepEqual(readScoutSettings(storage), { refreshMinutes: 30 });
  });
}

test('blocked storage reports that the settings were not saved', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  assert.equal(writeScoutSettings(storage, { refreshMinutes: 60 }), false);
  assert.equal(writeScoutSettings(null, { refreshMinutes: 60 }), false);
});
