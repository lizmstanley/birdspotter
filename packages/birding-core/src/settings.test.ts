import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, writeSettings } from './settings.ts';
import { MemoryStorage } from './testing/memoryStorage.ts';

const KEY = 'test_settings';
const DEFAULTS = { refreshMinutes: 30, radiusMiles: 7.5 };

test('saved settings come back on the next start, under the key the app gives', () => {
  const storage = new MemoryStorage();
  assert.equal(writeSettings(storage, KEY, { refreshMinutes: 15, radiusMiles: 25 }), true);
  assert.deepEqual(readSettings(storage, KEY), { refreshMinutes: 15, radiusMiles: 25 });
  assert.deepEqual(readSettings(storage, 'other_settings'), DEFAULTS);
});

test('with nothing saved the list refreshes every half hour and searches 7.5 miles', () => {
  assert.deepEqual(readSettings(new MemoryStorage(), KEY), DEFAULTS);
  assert.deepEqual(readSettings(null, KEY), DEFAULTS);
});

test('settings saved before the radius existed keep their interval and search 7.5 miles', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"refreshMinutes":60}');
  assert.deepEqual(readSettings(storage, KEY), { refreshMinutes: 60, radiusMiles: 7.5 });
});

test('a radius that is not a choice falls back to 7.5 miles and keeps the saved interval', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"refreshMinutes":15,"radiusMiles":100}');
  assert.deepEqual(readSettings(storage, KEY), { refreshMinutes: 15, radiusMiles: 7.5 });
});

for (const [label, text] of [
  ['an interval that is not a choice', '{"refreshMinutes":5}'],
  ['an interval saved as text', '{"refreshMinutes":"15"}'],
  ['a value that is not an object', '15'],
  ['text that is not JSON', '{refreshMinutes'],
] as const) {
  test(`${label} falls back to the defaults`, () => {
    const storage = new MemoryStorage();
    storage.items.set(KEY, text);
    assert.deepEqual(readSettings(storage, KEY), DEFAULTS);
  });
}

test('blocked storage reports that the settings were not saved', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  assert.equal(writeSettings(storage, KEY, { refreshMinutes: 60, radiusMiles: 5 }), false);
  assert.equal(writeSettings(null, KEY, { refreshMinutes: 60, radiusMiles: 5 }), false);
});
