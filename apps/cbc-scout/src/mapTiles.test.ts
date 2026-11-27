import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilesCoveringBox, tileUrl } from './mapTiles.ts';

test('zoom 0 is the one world tile', () => {
  const tiles = tilesCoveringBox({ west: -93.3, south: 44.9, east: -93.2, north: 45 }, 0, 0);
  assert.deepEqual(tiles, [{ z: 0, x: 0, y: 0 }]);
});

test('a box gets the tiles at each zoom that touch it, west to east and north to south', () => {
  // Worked by hand: columns 3945 to 3950 and rows 5893 to 5900 at zoom 14.
  const tiles = tilesCoveringBox({ west: -93.3, south: 44.9, east: -93.2, north: 45 }, 14, 14);
  assert.equal(tiles.length, 6 * 8);
  assert.deepEqual(tiles[0], { z: 14, x: 3945, y: 5893 });
  assert.deepEqual(tiles[1], { z: 14, x: 3945, y: 5894 });
  assert.deepEqual(tiles.at(-1), { z: 14, x: 3950, y: 5900 });
});

test('a box reaching the antimeridian stays inside the tile grid', () => {
  const tiles = tilesCoveringBox({ west: 179.9, south: 10, east: 180, north: 20 }, 2, 2);
  assert.deepEqual(tiles, [{ z: 2, x: 3, y: 1 }]);
});

test('a tile URL fills the template', () => {
  assert.equal(tileUrl('https://t.test/p/{z}/{x}/{y}.pbf', { z: 3, x: 1, y: 2 }), 'https://t.test/p/3/1/2.pbf');
});
