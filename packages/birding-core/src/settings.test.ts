import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, writeSettings } from './settings.ts';
import { MemoryStorage } from './testing/memoryStorage.ts';

const KEY = 'test_settings';

test('saved settings come back on the next start, under the key the app gives', () => {
  const storage = new MemoryStorage();
  assert.equal(writeSettings(storage, KEY, { refreshMinutes: 15 }), true);
  assert.deepEqual(readSettings(storage, KEY), { refreshMinutes: 15 });
  assert.deepEqual(readSettings(storage, 'other_settings'), { refreshMinutes: 30 });
});

test('with nothing saved the list refreshes every half hour', () => {
  assert.deepEqual(readSettings(new MemoryStorage(), KEY), { refreshMinutes: 30 });
  assert.deepEqual(readSettings(null, KEY), { refreshMinutes: 30 });
});

for (const [label, text] of [
  ['an interval that is not a choice', '{"refreshMinutes":5}'],
  ['an interval saved as text', '{"refreshMinutes":"15"}'],
  ['a value that is not an object', '15'],
  ['text that is not JSON', '{refreshMinutes'],
] as const) {
  test(`${label} falls back to every half hour`, () => {
    const storage = new MemoryStorage();
    storage.items.set(KEY, text);
    assert.deepEqual(readSettings(storage, KEY), { refreshMinutes: 30 });
  });
}

test('blocked storage reports that the settings were not saved', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  assert.equal(writeSettings(storage, KEY, { refreshMinutes: 60 }), false);
  assert.equal(writeSettings(null, KEY, { refreshMinutes: 60 }), false);
});
