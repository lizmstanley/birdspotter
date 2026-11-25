import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCirclePolygon } from '../../src/services/ebird.ts';
import { isInAreaTest } from './nearby.ts';
import { birdsToLookFor, hotspotsToVisit } from './suggestions.ts';
import { areaData } from './testing/areaFixtures.ts';

// The fixture circle is centered at -93.25, 44.95; its area spans -93.3 to -93.2 and 44.9 to 45.
const area = areaData();
const isInArea = isInAreaTest(area, buildCirclePolygon(...area.circleCenter));
const here: [number, number] = [-93.25, 45.02];

const lake = { locId: 'L1', name: 'lake, south in the area', lng: -93.25, lat: 44.91 };
const park = { locId: 'L2', name: 'park, middle of the area', lng: -93.25, lat: 44.95 };
const marsh = { locId: 'L3', name: 'marsh, also middle of the area', lng: -93.24, lat: 44.95 };
const ridge = { locId: 'L4', name: 'ridge, just outside the area', lng: -93.25, lat: 45.03 };
const pond = { locId: 'L5', name: 'pond, north in the area', lng: -93.25, lat: 44.99 };

function report(speciesCode: string, locId: string, lat: number, obsDt = '2026-11-20 08:00') {
  return { speciesCode, locId, lng: -93.25, lat, obsDt };
}

test('ranks hotspots in the area by species reported there, ties nearest first, empty ones last', () => {
  const sightings = [
    report('bkcchi', 'L1', 44.91),
    report('dowwoo', 'L1', 44.91),
    report('snoowl', 'L1', 44.91),
    report('snoowl', 'L1', 44.91),
    report('houfin', 'L3', 44.95),
    report('norcar', 'L3', 44.95),
    report('blujay', 'L4', 45.03),
    report('pinsis', 'L4', 45.03),
    report('rolhaw', 'L4', 45.03),
    report('gyrfal', 'L4', 45.03),
    report('amecro', 'L2', 44.95),
    report('rebnut', 'L2', 44.95),
    report('comrav', 'personal', 44.99),
  ];

  const ranked = hotspotsToVisit([marsh, pond, park, lake, ridge], sightings, here, isInArea);

  assert.deepEqual(
    ranked.map(({ row, speciesCount }) => [row.item.name, speciesCount]),
    [
      ['lake, south in the area', 3],
      ['park, middle of the area', 2],
      ['marsh, also middle of the area', 2],
      ['pond, north in the area', 0],
    ]
  );
});

test('a species counts only at the hotspot of its latest report', () => {
  const sightings = [report('snoowl', 'L1', 44.91, '2026-11-18 08:00'), report('snoowl', 'L4', 45.03, '2026-11-22 08:00')];

  const ranked = hotspotsToVisit([lake], sightings, here, isInArea);

  assert.deepEqual(
    ranked.map(({ speciesCount }) => speciesCount),
    [0]
  );
});

test('with no area, ranks every hotspot around the person', () => {
  const sightings = [report('gyrfal', 'L4', 45.03), report('bkcchi', 'L1', 44.91), report('dowwoo', 'L1', 44.91)];

  const ranked = hotspotsToVisit([park, lake, ridge], sightings, here, null);

  assert.deepEqual(
    ranked.map(({ row, speciesCount }) => [row.item.name, speciesCount]),
    [
      ['lake, south in the area', 2],
      ['ridge, just outside the area', 1],
      ['park, middle of the area', 0],
    ]
  );
});

test('lists species last reported outside the area, nearest first, marking notable ones', () => {
  const regular = [
    report('bkcchi', 'L1', 44.91),
    report('gyrfal', 'L4', 45.1, '2026-11-21 09:00'),
    report('dowwoo', 'L4', 45.03),
    report('snoowl', 'L2', 44.95, '2026-11-19 07:00'),
  ];
  const notable = [report('gyrfal', 'L4', 45.1, '2026-11-21 09:00'), report('snoowl', 'L4', 45.2, '2026-11-22')];

  const birds = birdsToLookFor(regular, notable, here, isInArea);

  assert.deepEqual(
    birds.map(({ row, isNotable }) => [row.item.speciesCode, row.item.lat, isNotable]),
    [
      ['dowwoo', 45.03, false],
      ['gyrfal', 45.1, true],
      ['snoowl', 45.2, true],
    ]
  );
});

test('a species last reported in the area is left out, even with an earlier report outside it', () => {
  const regular = [report('bkcchi', 'L2', 44.95, '2026-11-22 10:00')];
  const notable = [report('bkcchi', 'L4', 45.1, '2026-11-20 10:00')];

  assert.deepEqual(birdsToLookFor(regular, notable, here, isInArea), []);
});
