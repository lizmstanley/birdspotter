import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localeDistanceUnit } from './distanceUnit.ts';
import { RADIUS_CHOICES, readSettings, searchRadiusMiles, withDistanceUnit, writeSettings } from './settings.ts';
import { MemoryStorage } from './testing/memoryStorage.ts';

const KEY = 'test_settings';
const DEFAULTS = { refreshMinutes: 30, distanceUnit: 'mi', radius: 7.5, backDays: 7 } as const;
const KM_DEFAULTS = { refreshMinutes: 30, distanceUnit: 'km', radius: 12, backDays: 7 } as const;

test('saved settings come back on the next start, under the key the app gives', () => {
  const storage = new MemoryStorage();
  const saved = { refreshMinutes: 15, distanceUnit: 'km', radius: 40, backDays: 1 } as const;
  assert.equal(writeSettings(storage, KEY, saved), true);
  assert.deepEqual(readSettings(storage, KEY, 'mi'), saved);
  assert.deepEqual(readSettings(storage, 'other_settings', 'mi'), DEFAULTS);
});

test('with nothing saved the list refreshes every half hour, searches 7.5 miles, and goes back 7 days', () => {
  assert.deepEqual(readSettings(new MemoryStorage(), KEY, 'mi'), DEFAULTS);
  assert.deepEqual(readSettings(null, KEY, 'mi'), DEFAULTS);
});

test('with nothing saved and a kilometer locale, distances show in km and the search is 12 km', () => {
  assert.deepEqual(readSettings(new MemoryStorage(), KEY, 'km'), KM_DEFAULTS);
});

test('a saved unit wins over the locale', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"distanceUnit":"mi","radius":25}');
  assert.deepEqual(readSettings(storage, KEY, 'km'), { ...DEFAULTS, radius: 25 });
});

test('settings saved before the radius existed keep their interval and search 7.5 miles', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"refreshMinutes":60}');
  assert.deepEqual(readSettings(storage, KEY, 'mi'), { ...DEFAULTS, refreshMinutes: 60 });
});

test('settings saved before the days choice existed keep their values and go back 7 days', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"refreshMinutes":15,"radiusMiles":25}');
  assert.deepEqual(readSettings(storage, KEY, 'mi'), { ...DEFAULTS, refreshMinutes: 15, radius: 25 });
});

for (const [miles, km] of [
  [2, 3],
  [5, 8],
  [7.5, 12],
  [10, 16],
  [15, 25],
  [25, 40],
] as const) {
  test(`a ${miles} mile radius saved before the unit existed reads as ${km} km in a kilometer locale`, () => {
    const storage = new MemoryStorage();
    storage.items.set(KEY, `{"refreshMinutes":15,"radiusMiles":${miles}}`);
    assert.deepEqual(readSettings(storage, KEY, 'km'), { ...KM_DEFAULTS, refreshMinutes: 15, radius: km });
  });

  test(`switching ${miles} miles to kilometers gives ${km} km, and back gives ${miles} miles`, () => {
    const inKm = withDistanceUnit({ ...DEFAULTS, radius: miles }, 'km');
    assert.deepEqual(inKm, { ...KM_DEFAULTS, radius: km });
    assert.deepEqual(withDistanceUnit(inKm, 'mi'), { ...DEFAULTS, radius: miles });
  });
}

test('a radius with no unit saved beside it is not read in the locale unit', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"radius":25}');
  assert.equal(readSettings(storage, KEY, 'km').radius, 12);
  storage.items.set(KEY, '{"distanceUnit":"yd","radius":5}');
  assert.equal(readSettings(storage, KEY, 'mi').radius, 7.5);
});

test('a radius not in its unit list falls back to that unit default', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"distanceUnit":"km","radius":7.5}');
  assert.deepEqual(readSettings(storage, KEY, 'mi'), KM_DEFAULTS);
});

test('the search runs in miles, so a kilometer radius is converted and stays within eBird 50 km', () => {
  assert.equal(searchRadiusMiles({ ...DEFAULTS, radius: 7.5 }), 7.5);
  assert.ok(Math.abs(searchRadiusMiles({ ...KM_DEFAULTS, radius: 16 }) - 9.942) < 0.001);
  assert.ok(Math.max(...RADIUS_CHOICES.km) <= 50);
});

for (const [label, value] of [
  ['0 days', '0'],
  ['31 days', '31'],
  ['a part of a day', '2.5'],
  ['days saved as text', '"3"'],
] as const) {
  test(`${label} falls back to 7 days and keeps the other saved settings`, () => {
    const storage = new MemoryStorage();
    storage.items.set(KEY, `{"refreshMinutes":15,"radiusMiles":25,"backDays":${value}}`);
    assert.deepEqual(readSettings(storage, KEY, 'mi'), { ...DEFAULTS, refreshMinutes: 15, radius: 25 });
  });
}

test('30 days, the most eBird returns, is kept', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"backDays":30}');
  assert.equal(readSettings(storage, KEY, 'mi').backDays, 30);
});

test('a radius that is not a choice falls back to 7.5 miles and keeps the saved interval', () => {
  const storage = new MemoryStorage();
  storage.items.set(KEY, '{"refreshMinutes":15,"radiusMiles":100}');
  assert.deepEqual(readSettings(storage, KEY, 'mi'), { ...DEFAULTS, refreshMinutes: 15 });
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
    assert.deepEqual(readSettings(storage, KEY, 'mi'), DEFAULTS);
  });
}

test('blocked storage reports that the settings were not saved', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  assert.equal(writeSettings(storage, KEY, DEFAULTS), false);
  assert.equal(writeSettings(null, KEY, DEFAULTS), false);
});

for (const [tag, unit] of [
  ['en-US', 'mi'],
  ['en', 'mi'],
  ['es-US', 'mi'],
  ['en-GB', 'km'],
  ['en-CA', 'km'],
  ['de', 'km'],
  ['fr-CA', 'km'],
  ['not a tag', 'mi'],
] as const) {
  test(`the locale ${tag} defaults to ${unit}`, () => {
    assert.equal(localeDistanceUnit(tag), unit);
  });
}
