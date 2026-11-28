import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, writeSettings } from '@birdspotter/birding-core/settings.ts';
import { MemoryStorage } from '@birdspotter/birding-core/testing/memoryStorage.ts';
import { readScoutSettings, type ScoutSettings } from './scoutSettings.ts';

const KEY = 'test_scout_settings';
const DEFAULT_SETTINGS = defaultSettings('mi');

test('turns the edge cue on for settings saved before it existed', () => {
  const storage = new MemoryStorage();
  storage.setItem(KEY, JSON.stringify({ refreshMinutes: 60, backDays: 3 }));
  assert.deepEqual(readScoutSettings(storage, KEY, 'mi'), {
    ...DEFAULT_SETTINGS,
    refreshMinutes: 60,
    backDays: 3,
    isEdgeCueOn: true,
  });
});

test('keeps the edge cue off once saved off, alongside the shared settings', () => {
  const storage = new MemoryStorage();
  const saved: ScoutSettings = { ...DEFAULT_SETTINGS, backDays: 14, isEdgeCueOn: false };
  writeSettings(storage, KEY, saved);
  assert.deepEqual(readScoutSettings(storage, KEY, 'mi'), saved);
});

test('turns the edge cue on when the saved value is not a boolean or the settings are unreadable', () => {
  const storage = new MemoryStorage();
  storage.setItem(KEY, JSON.stringify({ isEdgeCueOn: 'no' }));
  const wrongType = readScoutSettings(storage, KEY, 'mi').isEdgeCueOn;
  storage.setItem(KEY, '{not json');
  assert.deepEqual([wrongType, readScoutSettings(storage, KEY, 'mi').isEdgeCueOn], [true, true]);
});

test('turns the edge cue on with no storage', () => {
  assert.equal(readScoutSettings(null, KEY, 'mi').isEdgeCueOn, true);
});
