import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RegionTest } from './nearby.ts';
import { hotspotsToVisit } from './suggestions.ts';

const isInRegion: RegionTest = ({ lng, lat }) => lng >= -93.3 && lng <= -93.2 && lat >= 44.9 && lat <= 45;
const here: [number, number] = [-93.25, 45.02];

const lake = { locId: 'L1', name: 'lake, south in the region', lng: -93.25, lat: 44.91 };
const park = { locId: 'L2', name: 'park, middle of the region', lng: -93.25, lat: 44.95 };
const marsh = { locId: 'L3', name: 'marsh, also middle of the region', lng: -93.24, lat: 44.95 };
const ridge = { locId: 'L4', name: 'ridge, just outside the region', lng: -93.25, lat: 45.03 };
const pond = { locId: 'L5', name: 'pond, north in the region', lng: -93.25, lat: 44.99 };

function report(speciesCode: string, locId: string, lat: number, obsDt = '2026-11-20 08:00') {
  return { speciesCode, locId, lng: -93.25, lat, obsDt };
}

test('ranks hotspots in the region by species reported there, ties nearest first, empty ones last', () => {
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

  const ranked = hotspotsToVisit([marsh, pond, park, lake, ridge], sightings, here, isInRegion);

  assert.deepEqual(
    ranked.map(({ row, species }) => [row.item.name, species.length]),
    [
      ['lake, south in the region', 3],
      ['park, middle of the region', 2],
      ['marsh, also middle of the region', 2],
      ['pond, north in the region', 0],
    ]
  );
});

test('a hotspot lists each species reported there once, at its latest report there', () => {
  const sightings = [
    report('snoowl', 'L1', 44.91, '2026-11-18 08:00'),
    report('snoowl', 'L1', 44.91, '2026-11-21 08:00'),
    report('snoowl', 'L4', 45.03, '2026-11-22 08:00'),
    report('bkcchi', 'L1', 44.91, '2026-11-19 08:00'),
  ];

  const [ranked] = hotspotsToVisit([lake], sightings, here, isInRegion);

  assert.deepEqual(
    ranked.species.map(({ speciesCode, obsDt }) => [speciesCode, obsDt]),
    [
      ['snoowl', '2026-11-21 08:00'],
      ['bkcchi', '2026-11-19 08:00'],
    ]
  );
});

test('with no region, ranks every hotspot around the person', () => {
  const sightings = [report('gyrfal', 'L4', 45.03), report('bkcchi', 'L1', 44.91), report('dowwoo', 'L1', 44.91)];

  const ranked = hotspotsToVisit([park, lake, ridge], sightings, here, null);

  assert.deepEqual(
    ranked.map(({ row, species }) => [row.item.name, species.length]),
    [
      ['lake, south in the region', 2],
      ['ridge, just outside the region', 1],
      ['park, middle of the region', 0],
    ]
  );
});
