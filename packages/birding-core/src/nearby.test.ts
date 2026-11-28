import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingDegrees,
  compassPoint,
  directionTo,
  distanceMiles,
  findSpecies,
  formatDistance,
  groupSightings,
  isRecentSightingsHidden,
  latestAtEachPlace,
  NEARBY_RADIUS_MILES,
  nearbyQuery,
  noRecentSightingsText,
  sortNearby,
  speciesSearchKey,
  type NearbyQuery,
  type RegionTest,
  type SightingGroups,
} from './nearby.ts';

const isInRegion: RegionTest = ({ lng, lat }) => lng >= -93.3 && lng <= -93.2 && lat >= 44.9 && lat <= 45;
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
const nearOutside = { name: 'just north, outside the region', lng: -93.25, lat: 45.03 };
const farInside = { name: 'south edge of the region', lng: -93.25, lat: 44.91 };
const midInside = { name: 'middle of the region', lng: -93.25, lat: 44.95 };

test('lists places in the region first, then the rest, each nearest first', () => {
  const rows = sortNearby([farInside, nearOutside, midInside], here, isInRegion);

  assert.deepEqual(
    rows.map((row) => [row.item.name, row.isInRegion]),
    [
      ['middle of the region', true],
      ['south edge of the region', true],
      ['just north, outside the region', false],
    ]
  );
  assert.ok(Math.abs(rows[2].miles - MILES_PER_DEGREE_LATITUDE * 0.01) < 0.01);
});

test('with no region, lists places by distance alone', () => {
  const rows = sortNearby([farInside, nearOutside, midInside], here, null);

  assert.deepEqual(
    rows.map((row) => row.item.name),
    ['just north, outside the region', 'middle of the region', 'south edge of the region']
  );
  assert.ok(rows.every((row) => !row.isInRegion));
});

test('each species shows once: its first notable report, and no regular row', () => {
  const report = (speciesCode: string, name: string, lat: number) => ({ speciesCode, name, lng: -93.25, lat });
  const notable = sortNearby(
    [report('snoowl', 'owl far', 44.91), report('snoowl', 'owl near', 44.95), report('gyrfal', 'falcon', 45.03)],
    here,
    isInRegion
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

test('keeps one report for each place, the latest there, including a date with no time', () => {
  const reports = [
    { locId: 'L1', obsDt: '2026-11-20 08:15', subId: 'S1' },
    { locId: 'L2', obsDt: '2026-11-19', subId: 'S2' },
    { locId: 'L1', obsDt: '2026-11-21 07:00', subId: 'S3' },
    { locId: 'L2', obsDt: '2026-11-19 16:30', subId: 'S4' },
    { locId: 'L1', obsDt: '2026-11-21', subId: 'S5' },
  ];
  assert.deepEqual(
    latestAtEachPlace(reports).map((report) => report.subId),
    ['S3', 'S4']
  );
});

test('a search key ignores case, spaces, and punctuation', () => {
  assert.equal(speciesSearchKey(" Red-breasted  Cooper's 2 "), 'redbreastedcoopers2');
  assert.equal(speciesSearchKey(" -' "), '');
  assert.equal(speciesSearchKey("Rüppell's Warbler"), speciesSearchKey('ruppells warbler'));
});

test('a species search keeps only the rows whose name holds the typed text, in both lists, in order', () => {
  const report = (speciesCode: string, comName: string, lat: number) => ({ speciesCode, comName, lng: -93.25, lat });
  const groups = groupSightings(
    sortNearby(
      [
        report('rebnut', 'Red-breasted Nuthatch', 44.92),
        report('coohaw', "Cooper's Hawk", 44.94),
        report('bkcchi', 'Black-capped Chickadee', 44.95),
        report('whbnut', 'White-breasted Nuthatch', 44.93),
      ],
      here,
      null
    ),
    sortNearby([report('pygnut', 'Pygmy Nuthatch', 44.96)], here, null)
  );
  const names = (rows: SightingGroups<ReturnType<typeof report>>) => ({
    notable: rows.notable.map((row) => row.item.comName),
    regular: rows.regular.map((row) => row.item.comName),
  });

  assert.deepEqual(names(findSpecies(groups, speciesSearchKey('NUTH'))), {
    notable: ['Pygmy Nuthatch'],
    regular: ['White-breasted Nuthatch', 'Red-breasted Nuthatch'],
  });
  assert.deepEqual(names(findSpecies(groups, speciesSearchKey('coopers'))), { notable: [], regular: ["Cooper's Hawk"] });
  assert.deepEqual(names(findSpecies(groups, speciesSearchKey('red breasted'))), {
    notable: [],
    regular: ['Red-breasted Nuthatch'],
  });
  assert.deepEqual(names(findSpecies(groups, speciesSearchKey('owl'))), { notable: [], regular: [] });
  assert.equal(findSpecies(groups, ''), groups);
});

test('recent sightings hide only when a search matches notable sightings alone', () => {
  const row = sortNearby([{ speciesCode: 'snoowl', lng: -93.25, lat: 44.95 }], here, null);
  const onlyNotable = { notable: row, regular: [] };

  assert.equal(isRecentSightingsHidden(onlyNotable, 'owl'), true);
  assert.equal(isRecentSightingsHidden(onlyNotable, ' - '), false);
  assert.equal(isRecentSightingsHidden({ notable: [], regular: [] }, 'owl'), false);
  assert.equal(isRecentSightingsHidden({ notable: row, regular: row }, 'owl'), false);
});

test('with no recent rows, the line names the search, or says whether anything else was reported', () => {
  const row = sortNearby([{ speciesCode: 'snoowl', lng: -93.25, lat: 44.95 }], here, null);

  assert.equal(
    noRecentSightingsText({ notable: [], regular: [] }, ' owl '),
    'No species matching "owl" reported here in that time.'
  );
  assert.equal(noRecentSightingsText({ notable: row, regular: [] }, ''), 'No other sightings reported here in that time.');
  assert.equal(noRecentSightingsText({ notable: [], regular: [] }, ' - '), 'No sightings reported here in that time.');
});

test('with a pinned query, that query is used wherever the person is', () => {
  const pinned: NearbyQuery = { center: [-93.25, 44.95], radiusMiles: 15 };

  assert.equal(nearbyQuery(pinned, null, null, NEARBY_RADIUS_MILES), pinned);
  assert.equal(nearbyQuery(pinned, [-80, 30], null, NEARBY_RADIUS_MILES), pinned);
});

test('with nothing pinned and no position yet, there is no query', () => {
  assert.equal(nearbyQuery(null, null, null, NEARBY_RADIUS_MILES), null);
});

test('with nothing pinned, the query stays put until the person is half its radius away', () => {
  const first = nearbyQuery(null, [-93.25, 44.95], null, NEARBY_RADIUS_MILES);
  assert.deepEqual(first, { center: [-93.25, 44.95], radiusMiles: NEARBY_RADIUS_MILES });

  const halfRadiusInDegrees = NEARBY_RADIUS_MILES / 2 / MILES_PER_DEGREE_LATITUDE;
  const stillClose: [number, number] = [-93.25, 44.95 + halfRadiusInDegrees * 0.98];
  assert.equal(nearbyQuery(null, stillClose, first, NEARBY_RADIUS_MILES), first);

  const movedAway: [number, number] = [-93.25, 44.95 + halfRadiusInDegrees * 1.02];
  assert.deepEqual(nearbyQuery(null, movedAway, first, NEARBY_RADIUS_MILES), { center: movedAway, radiusMiles: NEARBY_RADIUS_MILES });
});

test('an earlier query too small to cover half the radius around the person is replaced', () => {
  const small: NearbyQuery = { center: [-93.25, 44.95], radiusMiles: NEARBY_RADIUS_MILES / 2 };

  assert.notEqual(nearbyQuery(null, [-93.25, 44.951], small, NEARBY_RADIUS_MILES), small);
});

test('a new radius starts a new search around the person, even close to the last one', () => {
  const wide = nearbyQuery(null, [-93.25, 44.95], null, 25);
  const closeBy: [number, number] = [-93.25, 44.951];

  assert.deepEqual(nearbyQuery(null, closeBy, wide, 2), { center: closeBy, radiusMiles: 2 });
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
