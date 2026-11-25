import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCircle } from './areaRegion.ts';
import { areaStatusAt, areaStatusText } from './areaStatus.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const circle = countCircle(area);

function statusTextAt(lng: number, lat: number, data = area): string {
  return areaStatusText(areaStatusAt(data, circle, lng, lat));
}

test('reads In Area 12 inside the area outline', () => {
  assert.equal(statusTextAt(-93.25, 44.95), 'In Area 12');
});

test('names an area whose code does not start with a digit by its code', () => {
  assert.equal(statusTextAt(-93.25, 44.95, areaData({ areaCode: 'NE' })), 'In NE');
});

test('reads Outside your area inside the circle but outside the outline', () => {
  assert.equal(statusTextAt(-93.25, 45.03), 'Outside your area');
});

test('reads Outside the circle beyond the 7.5-mile radius', () => {
  assert.equal(statusTextAt(-93.25, 45.1), 'Outside the circle');
});

test('reads Outside the circle when the area outline reaches past the circle', () => {
  const wideArea = areaData({
    outline: {
      type: 'Polygon',
      coordinates: [
        [
          [-93.5, 44.7],
          [-93, 44.7],
          [-93, 45.2],
          [-93.5, 45.2],
          [-93.5, 44.7],
        ],
      ],
    },
  });
  assert.equal(statusTextAt(-93.25, 45.15, wideArea), 'Outside the circle');
});

test('tests a multi-part outline against every part', () => {
  const twoParts = areaData({
    outline: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-93.3, 44.9],
            [-93.28, 44.9],
            [-93.28, 44.92],
            [-93.3, 44.9],
          ],
        ],
        [
          [
            [-93.22, 44.98],
            [-93.2, 44.98],
            [-93.2, 45],
            [-93.22, 44.98],
          ],
        ],
      ],
    },
  });
  assert.equal(statusTextAt(-93.205, 44.985, twoParts), 'In Area 12');
  assert.equal(statusTextAt(-93.25, 44.95, twoParts), 'Outside your area');
});

test('reads In the circle for a line outline, which has no inside', () => {
  const lineArea = areaData({
    outline: {
      type: 'LineString',
      coordinates: [
        [-93.3, 44.9],
        [-93.2, 45],
      ],
    },
  });
  assert.equal(statusTextAt(-93.25, 44.95, lineArea), 'In the circle');
  assert.equal(statusTextAt(-93.25, 45.1, lineArea), 'Outside the circle');
});
