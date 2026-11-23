import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAreaAt, type AreaOutline } from './areaLookup.ts';

function square(minLng: number, minLat: number, size: number): AreaOutline['boundary_geojson'] {
  const maxLng = minLng + size;
  const maxLat = minLat + size;
  return {
    type: 'Polygon',
    coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
  };
}

const OUTLINES: AreaOutline[] = [
  { code: 'Full CBC circle', label: 'Full CBC circle', boundary_geojson: square(-10, -10, 20) },
  { code: '1', label: '1 - West', boundary_geojson: square(0, 0, 1) },
  { code: '2', label: '2 - East', boundary_geojson: square(1, 0, 1) },
  { code: 'Road', label: 'Road', boundary_geojson: { type: 'LineString', coordinates: [[0, 0], [2, 1]] } },
];

test('a point inside an area returns that area', () => {
  assert.equal(findAreaAt(OUTLINES, 0.5, 0.5), '1');
  assert.equal(findAreaAt(OUTLINES, 1.5, 0.5), '2');
});

test('a point inside only the outer circle returns no area', () => {
  assert.equal(findAreaAt(OUTLINES, 5, 5), null);
});

test('a point outside every outline returns no area', () => {
  assert.equal(findAreaAt(OUTLINES, 50, 50), null);
});
