import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPlaces, placeFeatures } from './mapPlaces.ts';

const lake = { locId: 'L1', locName: 'Lake Nokomis', lat: 44.91, lng: -93.24 };

function report(speciesCode: string, comName: string, locId: string, locName = 'Somewhere', lat = 44.95, lng = -93.25) {
  return { speciesCode, comName, locId, locName, lat, lng };
}

test('a hotspot with reports is one place, with the hotspot name and position', () => {
  const places = mapPlaces(
    [lake],
    [report('bkcchi', 'Black-capped Chickadee', 'L1', 'Nokomis (lake)', 44.9101, -93.2401)],
    []
  );

  assert.deepEqual(places, [
    {
      locId: 'L1',
      name: 'Lake Nokomis',
      lat: 44.91,
      lng: -93.24,
      isHotspot: true,
      notableSpecies: [],
      otherSpeciesCount: 1,
    },
  ]);
});

test('every place with a notable report is notable, each species named once and left out of the other count', () => {
  const places = mapPlaces(
    [],
    [
      report('snoowl', 'Snowy Owl', 'P1'),
      report('bkcchi', 'Black-capped Chickadee', 'P1'),
      report('bkcchi', 'Black-capped Chickadee', 'P1'),
      report('snoowl', 'Snowy Owl', 'P2'),
    ],
    [report('snoowl', 'Snowy Owl', 'P1'), report('snoowl', 'Snowy Owl', 'P1'), report('snoowl', 'Snowy Owl', 'P2')]
  );

  assert.deepEqual(
    places.map(({ locId, notableSpecies, otherSpeciesCount }) => [locId, notableSpecies, otherSpeciesCount]),
    [
      ['P1', ['Snowy Owl'], 1],
      ['P2', ['Snowy Owl'], 0],
    ]
  );
});

test('a notable species with no recent report at its place counts as no other species there', () => {
  const [place] = mapPlaces([], [report('snoowl', 'Snowy Owl', 'P1')], [report('snoowl', 'Snowy Owl', 'P2')]).filter(
    ({ locId }) => locId === 'P2'
  );

  assert.deepEqual([place.notableSpecies, place.otherSpeciesCount], [['Snowy Owl'], 0]);
});

test('a notable report at a hotspot keeps the hotspot name and position', () => {
  const [place] = mapPlaces([lake], [], [report('snoowl', 'Snowy Owl', 'L1', 'Nokomis (lake)', 44.9101, -93.2401)]);

  assert.deepEqual([place.name, place.lat, place.lng, place.isHotspot], ['Lake Nokomis', 44.91, -93.24, true]);
});

test('a hotspot with no reports is a place with no species', () => {
  const [place] = mapPlaces([lake], [], [report('snoowl', 'Snowy Owl', 'P2')]);

  assert.deepEqual([place.isHotspot, place.notableSpecies, place.otherSpeciesCount], [true, [], 0]);
});

test('features carry notable and hotspot as 1 or 0, at the place position', () => {
  const places = mapPlaces([lake], [report('amecro', 'American Crow', 'P3', 'Yard', 45, -93.3)], []);

  assert.deepEqual(
    placeFeatures(places).features.map(({ geometry, properties }) => [geometry.coordinates, properties]),
    [
      [[-93.24, 44.91], { locId: 'L1', notable: 0, hotspot: 1 }],
      [[-93.3, 45], { locId: 'P3', notable: 0, hotspot: 0 }],
    ]
  );
});

test('a notable place has notable 1', () => {
  const places = mapPlaces([], [], [report('snoowl', 'Snowy Owl', 'P2')]);

  assert.equal(placeFeatures(places).features[0].properties.notable, 1);
});
