import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapKml, toKmlColor, type MapKmlInput } from './kmlExport.ts';

const EMPTY: MapKmlInput = {
  title: 'MNBL — Test Circle',
  circle: null,
  areas: [],
  notCountedAreaCodes: [],
  hotspots: [],
  sightings: [],
};

const HOTSPOT = {
  locId: 'L123',
  locName: 'Lake <North> & Marsh',
  lat: 45.1,
  lng: -93.2,
  numSpeciesAllTime: 212,
  latestObsDt: '2026-11-20 08:15',
  area: '3',
};

const SIGHTING = {
  speciesCode: 'snoowl1',
  comName: 'Snowy Owl',
  sciName: 'Bubo scandiacus',
  locId: 'L9',
  locName: 'Airport fields',
  obsDt: '2026-11-22 15:00',
  lat: 45.2,
  lng: -93.3,
  subId: 'S100',
  area: null,
};

function placemarkCount(kml: string): number {
  return kml.match(/<Placemark>/g)?.length ?? 0;
}

test('KML colors are alpha, blue, green, red', () => {
  assert.equal(toKmlColor('#12AB34', 1), 'ff34ab12');
  assert.equal(toKmlColor('#12ab34', 0.28), '4734ab12');
});

test('a color that is not #rrggbb throws', () => {
  assert.throws(() => toKmlColor('red', 1), /kmlExport/);
});

test('each hotspot is a point at lng,lat with an escaped name and an eBird link', () => {
  const kml = buildMapKml({ ...EMPTY, hotspots: [HOTSPOT] });
  assert.match(kml, /<Folder><name>eBird Hotspots<\/name>/);
  assert.match(kml, /<name>Lake &lt;North&gt; &amp; Marsh<\/name>/);
  assert.match(kml, /<Point><coordinates>-93.2,45.1<\/coordinates><\/Point>/);
  assert.match(kml, /https:\/\/ebird.org\/hotspot\/L123/);
  assert.equal(kml.includes('<North>'), false);
});

test('a sighting links its checklist and shows X when eBird gave no count', () => {
  const kml = buildMapKml({ ...EMPTY, sightings: [SIGHTING] });
  assert.match(kml, /<name>Snowy Owl<\/name>/);
  assert.match(kml, /Count: X \(present\)/);
  assert.match(kml, /https:\/\/ebird.org\/checklist\/S100/);
});

test('the area a hotspot falls in shows only when areas are exported', () => {
  const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const withAreas = buildMapKml({
    ...EMPTY,
    areas: [{ code: '3', label: '3 - East', boundary_geojson: square }],
    hotspots: [HOTSPOT],
  });
  const withoutAreas = buildMapKml({ ...EMPTY, hotspots: [HOTSPOT] });
  assert.match(withAreas, /Area: Area 3/);
  assert.equal(withoutAreas.includes('Area: '), false);
});

test('a polygon with a hole writes outer and inner rings', () => {
  const kml = buildMapKml({
    ...EMPTY,
    areas: [
      {
        code: '1',
        boundary_geojson: {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
            [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
          ],
        },
      },
    ],
  });
  assert.match(kml, /<outerBoundaryIs><LinearRing><coordinates>0,0 4,0 4,4 0,4 0,0<\/coordinates>/);
  assert.match(kml, /<innerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,2 1,1<\/coordinates>/);
  assert.match(kml, /<styleUrl>#area-1<\/styleUrl>/);
});

test('a multipolygon area becomes one placemark with a MultiGeometry', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const kml = buildMapKml({
    ...EMPTY,
    areas: [{ code: '2', boundary_geojson: { type: 'MultiPolygon', coordinates: [[ring], [ring]] } }],
  });
  assert.equal(placemarkCount(kml), 1);
  assert.equal(kml.match(/<Polygon>/g)?.length, 2);
  assert.match(kml, /<MultiGeometry>/);
});

test('the circle exports its outline and center', () => {
  const kml = buildMapKml({ ...EMPTY, circle: { lat: 45, lng: -93, radiusMiles: 7.5 } });
  assert.match(kml, /<name>15-mile circle<\/name>/);
  assert.match(kml, /<name>Circle center<\/name><styleUrl>#circle<\/styleUrl><Point><coordinates>-93,45</);
  assert.equal(placemarkCount(kml), 2);
});

test('a layer with nothing in it writes no folder', () => {
  const kml = buildMapKml(EMPTY);
  assert.equal(kml.includes('<Folder>'), false);
  assert.match(kml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/);
});
