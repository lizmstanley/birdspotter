import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCirclePolygon } from '../../src/services/ebird.ts';
import {
  bearingDegrees,
  compassPoint,
  directionTo,
  distanceMiles,
  formatDistance,
  groupSightings,
  isInAreaTest,
  NEARBY_RADIUS_MILES,
  nearbyQuery,
  sortNearby,
  type NearbyQuery,
} from './nearby.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const circle = buildCirclePolygon(...area.circleCenter);
const MILES_PER_DEGREE_LATITUDE = 69.09;

test('one degree of latitude is about 69 miles, and one of longitude shrinks away from the equator', () => {
  assert.ok(Math.abs(distanceMiles([0, 0], [0, 1]) - MILES_PER_DEGREE_LATITUDE) < 0.01);
  const atMinneapolis = distanceMiles([-93, 45], [-92, 45]);
  assert.ok(Math.abs(atMinneapolis - MILES_PER_DEGREE_LATITUDE * Math.cos(Math.PI / 4)) < 0.1);
});

test('shows one decimal under 10 miles and whole miles from 10 up', () => {
  assert.equal(formatDistance(0.04), '0.0 mi');
  assert.equal(formatDistance(2.36), '2.4 mi');
  assert.equal(formatDistance(9.94), '9.9 mi');
  assert.equal(formatDistance(9.96), '10 mi');
  assert.equal(formatDistance(10), '10 mi');
  assert.equal(formatDistance(12.6), '13 mi');
});

const here: [number, number] = [-93.25, 45.02];
const nearOutside = { name: 'just north, outside the area', lng: -93.25, lat: 45.03 };
const farInside = { name: 'south edge of the area', lng: -93.25, lat: 44.91 };
const midInside = { name: 'middle of the area', lng: -93.25, lat: 44.95 };

test('lists places in the area first, then the rest, each nearest first', () => {
  const rows = sortNearby([farInside, nearOutside, midInside], here, isInAreaTest(area, circle));

  assert.deepEqual(
    rows.map((row) => [row.item.name, row.isInArea]),
    [
      ['middle of the area', true],
      ['south edge of the area', true],
      ['just north, outside the area', false],
    ]
  );
  assert.ok(Math.abs(rows[2].miles - MILES_PER_DEGREE_LATITUDE * 0.01) < 0.01);
});

test('with no area, lists places by distance alone', () => {
  const rows = sortNearby([farInside, nearOutside, midInside], here, null);

  assert.deepEqual(
    rows.map((row) => row.item.name),
    ['just north, outside the area', 'middle of the area', 'south edge of the area']
  );
  assert.ok(rows.every((row) => !row.isInArea));
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

test('each species shows once: its first notable report, and no regular row', () => {
  const report = (speciesCode: string, name: string, lat: number) => ({ speciesCode, name, lng: -93.25, lat });
  const notable = sortNearby(
    [report('snoowl', 'owl far', 44.91), report('snoowl', 'owl near', 44.95), report('gyrfal', 'falcon', 45.03)],
    here,
    isInAreaTest(area, circle)
  );
  const regular = sortNearby(
    [report('bkcchi', 'chickadee', 44.95), report('snoowl', 'owl latest', 44.92), report('gyrfal', 'falcon latest', 45)],
    here,
    null
  );

  const groups = groupSightings(regular, notable);

  assert.deepEqual(
    groups.notable.map((row) => row.item.name),
    ['owl near', 'falcon']
  );
  assert.deepEqual(
    groups.regular.map((row) => row.item.name),
    ['chickadee']
  );
});

test('with no notable reports, every regular row stays', () => {
  const regular = sortNearby([{ speciesCode: 'bkcchi', lng: -93.25, lat: 44.95 }], here, null);

  assert.deepEqual(groupSightings(regular, []), { notable: [], regular });
});

test('with an area, the query is the whole circle wherever the person is', () => {
  const expected = { center: area.circleCenter, radiusMiles: 7.5 };

  assert.deepEqual(nearbyQuery(area, null, null), expected);
  assert.deepEqual(nearbyQuery(area, [-80, 30], null), expected);
});

test('with no area and no position yet, there is no query', () => {
  assert.equal(nearbyQuery(null, null, null), null);
});

test('with no area, the query stays put until the person is half its radius away', () => {
  const first = nearbyQuery(null, [-93.25, 44.95], null);
  assert.deepEqual(first, { center: [-93.25, 44.95], radiusMiles: NEARBY_RADIUS_MILES });

  const halfRadiusInDegrees = NEARBY_RADIUS_MILES / 2 / MILES_PER_DEGREE_LATITUDE;
  const stillClose: [number, number] = [-93.25, 44.95 + halfRadiusInDegrees * 0.98];
  assert.equal(nearbyQuery(null, stillClose, first), first);

  const movedAway: [number, number] = [-93.25, 44.95 + halfRadiusInDegrees * 1.02];
  assert.deepEqual(nearbyQuery(null, movedAway, first), { center: movedAway, radiusMiles: NEARBY_RADIUS_MILES });
});

test('an earlier query too small to cover half the radius around the person is replaced', () => {
  const small: NearbyQuery = { center: [-93.25, 44.95], radiusMiles: NEARBY_RADIUS_MILES / 2 };

  assert.notEqual(nearbyQuery(null, [-93.25, 44.951], small), small);
});

test('names the compass point a place lies toward', () => {
  const center: [number, number] = [-93.25, 44.95];
  assert.equal(compassPoint(bearingDegrees(center, [-93.25, 45.05])), 'N');
  assert.equal(compassPoint(bearingDegrees(center, [-93.15, 44.95])), 'E');
  assert.equal(compassPoint(bearingDegrees(center, [-93.25, 44.85])), 'S');
  assert.equal(compassPoint(bearingDegrees(center, [-93.35, 44.95])), 'W');
  assert.equal(compassPoint(bearingDegrees(center, [-93.15, 45.02])), 'NE');
  assert.equal(compassPoint(bearingDegrees(center, [-93.35, 44.88])), 'SW');
});

test('wraps around north, so bearings just either side of it are both N', () => {
  assert.equal(compassPoint(350), 'N');
  assert.equal(compassPoint(10), 'N');
  assert.equal(compassPoint(22.4), 'N');
  assert.equal(compassPoint(22.6), 'NE');
  assert.equal(compassPoint(337.6), 'N');
  assert.equal(compassPoint(337.4), 'NW');
});

test('points east across the antimeridian rather than the long way round', () => {
  assert.equal(compassPoint(bearingDegrees([179.95, 52], [-179.95, 52])), 'E');
  assert.equal(compassPoint(bearingDegrees([-179.95, 52], [179.95, 52])), 'W');
});

test('points along the compass far north, where meridians crowd together', () => {
  assert.equal(compassPoint(bearingDegrees([-156.79, 71.29], [-156.5, 71.29])), 'E');
  assert.equal(compassPoint(bearingDegrees([-156.79, 71.29], [-156.79, 71.4])), 'N');
});

test('gives no direction when the place is too close to tell which way', () => {
  assert.equal(directionTo([-93.25, 44.95], [-93.25, 44.9513], 0.09), null);
  assert.equal(directionTo([-93.25, 44.95], [-93.25, 44.9515], 0.1), 'N');
});

test('gives each sorted row the direction from the person', () => {
  const rows = sortNearby([nearOutside, farInside], here, null);
  assert.deepEqual(
    rows.map((row) => row.direction),
    ['N', 'S']
  );
});
