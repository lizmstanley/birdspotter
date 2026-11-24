import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAP_STYLE_URL } from './basemap.ts';

test('basemap loads the OpenFreeMap liberty style', () => {
  assert.equal(BASEMAP_STYLE_URL, 'https://tiles.openfreemap.org/styles/liberty');
});
