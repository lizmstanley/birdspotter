import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_AREA_STORAGE_KEY,
  AREAS_STORAGE_KEY,
  NO_SAVED_AREAS,
  readSavedAreas,
  withActiveArea,
  withArea,
  withoutArea,
  writeSavedAreas,
} from './savedAreas.ts';
import { MemoryStorage } from '@birdspotter/birding-core/testing/memoryStorage.ts';
import { areaData, areaPayload } from './testing/areaFixtures.ts';

const AREA_12 = { payload: areaPayload(), data: areaData() };
const AREA_7 = { payload: areaPayload({ areaCode: '7', areaLabel: 'Lake' }), data: areaData({ areaCode: '7', areaLabel: 'Lake' }) };

function twoAreas() {
  return withArea(withArea(NO_SAVED_AREAS, AREA_12.payload, AREA_12.data), AREA_7.payload, AREA_7.data);
}

test('a loaded area becomes the active one', () => {
  const saved = twoAreas();
  assert.deepEqual(saved.areas.map((area) => area.key), ['MNMI/12', 'MNMI/7']);
  assert.equal(saved.activeKey, 'MNMI/7');
});

test('loading a saved area again replaces its copy and makes it active', () => {
  const updated = areaData({ circleCode: 'mnmi', leaders: [] });
  const saved = withArea(twoAreas(), 'new-payload', updated);
  assert.deepEqual(saved.areas.map((area) => area.key), ['MNMI/7', 'MNMI/12']);
  assert.equal(saved.areas[1].payload, 'new-payload');
  assert.equal(saved.activeKey, 'MNMI/12');
});

test('area codes match ignoring case', () => {
  const upper = withArea(NO_SAVED_AREAS, 'upper', areaData({ areaCode: '12A' }));
  const saved = withArea(upper, 'lower', areaData({ areaCode: '12a' }));
  assert.deepEqual(saved.areas.map((area) => area.payload), ['lower']);
});

test('removing the active area makes the latest remaining one active', () => {
  const saved = withoutArea(withArea(twoAreas(), AREA_12.payload, AREA_12.data), 'MNMI/12');
  assert.deepEqual(saved.areas.map((area) => area.key), ['MNMI/7']);
  assert.equal(saved.activeKey, 'MNMI/7');
});

test('removing the last area leaves none active', () => {
  const saved = withoutArea(withoutArea(twoAreas(), 'MNMI/7'), 'MNMI/12');
  assert.deepEqual(saved, NO_SAVED_AREAS);
});

test('removing another area keeps the active one', () => {
  assert.equal(withoutArea(twoAreas(), 'MNMI/12').activeKey, 'MNMI/7');
});

test('picking an unknown area changes nothing', () => {
  const saved = twoAreas();
  assert.equal(withActiveArea(saved, 'OTHER/1'), saved);
  assert.equal(withActiveArea(saved, 'MNMI/12').activeKey, 'MNMI/12');
});

test('saved areas and the active one come back from storage', () => {
  const storage = new MemoryStorage();
  assert.equal(writeSavedAreas(storage, withActiveArea(twoAreas(), 'MNMI/12')), true);
  const { saved, unreadableCount } = readSavedAreas(storage);
  assert.deepEqual(saved.areas.map((area) => area.data.areaLabel), ['12 - Richfield', 'Lake']);
  assert.equal(saved.activeKey, 'MNMI/12');
  assert.equal(unreadableCount, 0);
});

// Encoded by the version 1 encoder from `areaData()`, before links carried a note.
const VERSION_1_PAYLOAD =
  'RY7RCoMgFIZfJc61Dm05qKvdDlbEbsMLV2ckuJKSMYjefUe7GIL_z-f51A0-UEkGPVRQN_UNGEyx2mlC42dn16yZlzASn6HqeHnOlRCCFUUZUzMwNC5zOn-mkvHsYfvxZdENBAPBltKT3EX9TFbSU8q0x3U0_gdH1ZqecCRv6V-tCdkdzYDLcSdcZM6VUlzQNCEk5E244te8vcNTwDXArvcf';

test('an area saved from a version 1 link still reads, with no note', () => {
  const storage = new MemoryStorage();
  storage.setItem(AREAS_STORAGE_KEY, JSON.stringify([VERSION_1_PAYLOAD]));
  const { saved, unreadableCount } = readSavedAreas(storage);
  assert.equal(unreadableCount, 0);
  assert.deepEqual(saved.areas[0].data, areaData());
});

test('unreadable stored areas are dropped and counted', () => {
  const storage = new MemoryStorage();
  storage.setItem(AREAS_STORAGE_KEY, JSON.stringify([AREA_12.payload, 'damaged', 42]));
  storage.setItem(ACTIVE_AREA_STORAGE_KEY, 'MNMI/99');
  const { saved, unreadableCount } = readSavedAreas(storage);
  assert.deepEqual(saved.areas.map((area) => area.key), ['MNMI/12']);
  assert.equal(saved.activeKey, 'MNMI/12');
  assert.equal(unreadableCount, 2);
});

test('a stored list that is not JSON counts as one unreadable entry', () => {
  const storage = new MemoryStorage();
  storage.setItem(AREAS_STORAGE_KEY, '{oops');
  assert.deepEqual(readSavedAreas(storage), { saved: NO_SAVED_AREAS, unreadableCount: 1 });
});

test('writing reports a blocked browser', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  assert.equal(writeSavedAreas(storage, twoAreas()), false);
});

test('writing with no active area clears the stored active key', () => {
  const storage = new MemoryStorage();
  storage.setItem(ACTIVE_AREA_STORAGE_KEY, 'MNMI/12');
  writeSavedAreas(storage, NO_SAVED_AREAS);
  assert.equal(storage.getItem(ACTIVE_AREA_STORAGE_KEY), null);
  assert.equal(storage.getItem(AREAS_STORAGE_KEY), '[]');
});
