import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { BoundaryFileTooLargeError, InvalidCoordinatesError } from './errors.ts';
import { KMZ_MAX_BYTES, KMZ_MAX_UNZIPPED_BYTES, parseGeoJsonText, parseKmlText, parseKmzBuffer } from './kmlParser.ts';

const SQUARE = [
  [
    [-93.3, 44.8],
    [-93.2, 44.8],
    [-93.2, 44.9],
    [-93.3, 44.8],
  ],
];

function featureCollection(...features: unknown[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

function feature(name: string, type: string, coordinates: unknown) {
  return { type: 'Feature', properties: { name }, geometry: { type, coordinates } };
}

test('lines and polygons on the globe keep their coordinates', () => {
  const parsed = parseGeoJsonText(
    featureCollection(
      feature('Area 1', 'Polygon', SQUARE),
      feature('Area 2', 'MultiPolygon', [SQUARE]),
      feature('Area 3', 'LineString', [
        [-93.3, 44.8, 250],
        [-93.2, 44.9, 250],
      ])
    )
  );

  assert.deepEqual(
    parsed.map((b) => [b.code, b.geometry.type, b.geometry.coordinates]),
    [
      ['1', 'Polygon', SQUARE],
      ['2', 'MultiPolygon', [SQUARE]],
      [
        '3',
        'LineString',
        [
          [-93.3, 44.8, 250],
          [-93.2, 44.9, 250],
        ],
      ],
    ]
  );
});

test('points and unknown geometry types are skipped', () => {
  const parsed = parseGeoJsonText(
    featureCollection(feature('Parking', 'Point', [-93.3, 44.8]), feature('Odd', 'toString', SQUARE))
  );

  assert.deepEqual(parsed, []);
});

for (const [why, type, coordinates] of [
  ['a latitude above 90', 'Polygon', [[[-93.3, 94.8], [-93.2, 44.8], [-93.2, 44.9]]]],
  ['a longitude below -180', 'LineString', [[-193.3, 44.8], [-93.2, 44.9]]],
  ['a coordinate given as text', 'LineString', [['-93.3', '44.8'], [-93.2, 44.9]]],
  ['a position with one number', 'MultiPolygon', [[[[-93.3], [-93.2, 44.8], [-93.2, 44.9]]]]],
  ['rings that are not lists', 'Polygon', 'oops'],
] as const) {
  test(`a boundary with ${why} is rejected with its name`, () => {
    assert.throws(
      () => parseGeoJsonText(featureCollection(feature('Area 7', type, coordinates))),
      (err) => err instanceof InvalidCoordinatesError && err.featureName === 'Area 7'
    );
  });
}

test('a .kmz archive over the size limit is rejected before unzipping', () => {
  assert.throws(
    () => parseKmzBuffer(new ArrayBuffer(KMZ_MAX_BYTES + 1)),
    (err) => err instanceof BoundaryFileTooLargeError && err.part === 'archive'
  );
});

function archive(files: Record<string, Uint8Array>): ArrayBuffer {
  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

test('a .kmz whose KML unzips past the limit is rejected', () => {
  const bomb = archive({ 'doc.kml': new Uint8Array(KMZ_MAX_UNZIPPED_BYTES + 1) });

  assert.throws(
    () => parseKmzBuffer(bomb),
    (err) => err instanceof BoundaryFileTooLargeError && err.part === 'unzipped' && err.sizeBytes > KMZ_MAX_UNZIPPED_BYTES
  );
});

test('large images in a .kmz do not count toward the unzipped limit', (t) => {
  const parsedTexts: string[] = [];
  // Node has no DOMParser; this stand-in records the KML text and finds no placemarks.
  Object.assign(globalThis, {
    DOMParser: class {
      parseFromString(text: string) {
        parsedTexts.push(text);
        return { querySelector: () => null, getElementsByTagName: () => [] };
      }
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'DOMParser'));
  const kml = '<kml><Document/></kml>';
  const kmz = archive({
    'doc.kml': new TextEncoder().encode(kml),
    'images/photo.png': new Uint8Array(KMZ_MAX_UNZIPPED_BYTES + 1),
  });

  assert.deepEqual(parseKmzBuffer(kmz), []);
  assert.deepEqual(parsedTexts, [kml]);
});

/** Node has no DOMParser; this stand-in parses to one placemark with a line of the given coordinates. */
function fakeLineDocument(name: string, coordinates: string) {
  const text = (value: string) => [{ textContent: value }];
  const placemark = {
    getElementsByTagName: (tag: string) => (tag === 'name' ? text(name) : []),
    querySelector: (selector: string) => (selector === 'LineString coordinates' ? { textContent: coordinates } : null),
  };
  return {
    querySelector: () => null,
    getElementsByTagName: (tag: string) => (tag === 'Placemark' ? [placemark] : []),
  };
}

function useFakeLineDocument(t: { after: (fn: () => void) => void }, name: string, coordinates: string) {
  Object.assign(globalThis, {
    DOMParser: class {
      parseFromString() {
        return fakeLineDocument(name, coordinates);
      }
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'DOMParser'));
}

test('a KML line on the globe keeps its longitude and latitude', (t) => {
  useFakeLineDocument(t, 'Area 4', '-93.3,44.8,0 -93.2,44.9,0');

  assert.deepEqual(
    parseKmlText('<kml/>').map((b) => b.geometry.coordinates),
    [
      [
        [-93.3, 44.8],
        [-93.2, 44.9],
      ],
    ]
  );
});

for (const [why, coordinates] of [
  ['a latitude above 90', '-93.3,94.8 -93.2,44.9'],
  ['a missing latitude', '-93.3, -93.2,44.9'],
  ['an empty trailing part', '-93.3,44.8, -93.2,44.9'],
  ['text where a number belongs', '-93.3,north -93.2,44.9'],
  ['more than three numbers', '-93.3,44.8,0,5 -93.2,44.9'],
] as const) {
  test(`a KML line with ${why} is rejected with its name`, (t) => {
    useFakeLineDocument(t, 'Area 4', coordinates);

    assert.throws(
      () => parseKmlText('<kml/>'),
      (err) => err instanceof InvalidCoordinatesError && err.featureName === 'Area 4'
    );
  });
}
