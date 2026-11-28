import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metersToNearestEdge } from './areaEdge.ts';
import { countCircle } from './areaRegion.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95 with a 7.5-mile radius; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const circle = countCircle(area);
const METERS_PER_DEGREE_LAT = 111_320;

test('measures to the nearest side of the area outline', () => {
  const meters = metersToNearestEdge(area, circle, -93.25, 45.0005);
  assert.ok(Math.abs(meters - 0.0005 * METERS_PER_DEGREE_LAT) < 1, `got ${meters}`);
});

test('measures inside the area as well as outside it', () => {
  const meters = metersToNearestEdge(area, circle, -93.25, 44.9995);
  assert.ok(Math.abs(meters - 0.0005 * METERS_PER_DEGREE_LAT) < 1, `got ${meters}`);
});

test('measures to the circle when it is nearer than the area', () => {
  const nearCircleEdge = metersToNearestEdge(area, circle, -93.25, 44.95 + 7.5 / 69.05);
  assert.ok(nearCircleEdge < 50, `got ${nearCircleEdge}`);
});

test('measures only to the circle for a route line, which has no edge', () => {
  const route = areaData({
    outline: {
      type: 'LineString',
      coordinates: [
        [-93.3, 44.95],
        [-93.2, 44.95],
      ],
    },
  });
  const onTheLine = metersToNearestEdge(route, circle, -93.25, 44.95);
  assert.ok(onTheLine > 10_000, `got ${onTheLine}`);
});

test('measures to every polygon of a multipolygon area', () => {
  const twoParts = areaData({
    outline: {
      type: 'MultiPolygon',
      coordinates: [
        area.outline.type === 'Polygon' ? area.outline.coordinates : [],
        [
          [
            [-93.1, 44.9],
            [-93.05, 44.9],
            [-93.05, 44.95],
            [-93.1, 44.95],
            [-93.1, 44.9],
          ],
        ],
      ],
    },
  });
  const meters = metersToNearestEdge(twoParts, circle, -93.0995, 44.92);
  assert.ok(meters < 50, `got ${meters}`);
});
