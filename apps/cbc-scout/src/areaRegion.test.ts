import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCircle, countCircleQuery, isInAreaTest } from './areaRegion.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const circle = countCircle(area);
const nearOutside = { lng: -93.25, lat: 45.03 };

test('a place inside the area outline is in the area, one just outside it is not', () => {
  const isInArea = isInAreaTest(area, circle);

  assert.equal(isInArea({ lng: -93.25, lat: 44.95 }), true);
  assert.equal(isInArea(nearOutside), false);
});

test('for a line outline, places in the circle count as in the area', () => {
  const lineArea = areaData({
    outline: {
      type: 'LineString',
      coordinates: [
        [-93.3, 44.9],
        [-93.2, 45],
      ],
    },
  });
  const isInArea = isInAreaTest(lineArea, circle);

  assert.equal(isInArea(nearOutside), true);
  assert.equal(isInArea({ lng: -93.25, lat: 45.1 }), false);
});

test('the query is the whole count circle', () => {
  assert.deepEqual(countCircleQuery(area), { center: area.circleCenter, radiusMiles: 7.5 });
});
