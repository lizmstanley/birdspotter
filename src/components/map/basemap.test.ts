import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBasemapStyle } from './basemap.ts';

test('street basemap uses OpenStreetMap tiles', () => {
  const source = getBasemapStyle('street').sources.basemap;
  assert.equal(source.type, 'raster');
  assert.deepEqual(source.type === 'raster' && source.tiles, ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
});

test('satellite basemap uses Esri imagery and credits Esri', () => {
  const source = getBasemapStyle('satellite').sources.basemap;
  assert.ok(source.type === 'raster' && source.tiles?.[0].includes('World_Imagery'));
  assert.ok(source.type === 'raster' && source.attribution?.includes('Esri'));
});
