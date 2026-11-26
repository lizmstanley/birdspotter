import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import type { Position } from 'geojson';
import {
  AREA_LINK_FORMAT_VERSION,
  AREA_NOTE_MAX_LENGTH,
  AreaLinkTooLargeError,
  AreaNoteTooLongError,
  buildAreaLink,
  decodeAreaLink,
  encodeAreaLink,
  InvalidAreaLinkError,
  QR_MAX_BYTES_MEDIUM,
  UnsupportedAreaLinkVersionError,
  type AreaLinkData,
} from './areaLink.ts';

const BASE_URL = 'https://example.test/cbc/scout/';

const SQUARE: Position[][] = [
  [
    [-93.30001, 44.90001],
    [-93.2, 44.90001],
    [-93.2, 45.00002],
    [-93.30001, 45.00002],
    [-93.30001, 44.90001],
  ],
];

const AREA: AreaLinkData = {
  circleCode: 'MNMI',
  circleName: 'Minneapolis North',
  circleCenter: [-93.25, 44.95],
  areaCode: '12',
  areaLabel: '12 - Richfield',
  outline: { type: 'Polygon', coordinates: SQUARE },
  leaders: [
    { name: 'Pat Leader', phone: '612-555-0100', email: 'pat@example.test' },
    { name: 'Sam Second' },
  ],
};

function packedPayload(value: unknown): string {
  const bytes = deflateSync(strToU8(JSON.stringify(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VALID_PACKED = {
  v: AREA_LINK_FORMAT_VERSION,
  c: 'MNMI',
  n: 'Minneapolis North',
  o: [-9325000, 4495000],
  a: '12',
  t: 'P',
  p: [[[-9330001, 4490001, 10001, 0, 0, 10001, -10001, 0, 0, -10001]]],
};

/** A ring of `count` points around a center, with a wobble so simplifying has points to drop. */
function wobblyRing(count: number): Position[] {
  const ring: Position[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const radius = 0.05 + 0.0004 * Math.sin(i * 7.3);
    ring.push([-93.25 + radius * Math.cos(angle), 44.95 + radius * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Text that deflate cannot shrink much, from a fixed-seed generator so the test is repeatable. */
function incompressibleText(length: number): string {
  let seed = 12345;
  let text = '';
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    text += String.fromCharCode(33 + (seed % 94));
  }
  return text;
}

test('an encoded area decodes to the same circle, area, outline, and leaders', () => {
  assert.deepEqual(decodeAreaLink(encodeAreaLink(AREA)), AREA);
});

test('multipolygon and line outlines decode to the same geometry', () => {
  const multi: AreaLinkData = { ...AREA, outline: { type: 'MultiPolygon', coordinates: [SQUARE, SQUARE] } };
  const line: AreaLinkData = { ...AREA, outline: { type: 'LineString', coordinates: SQUARE[0] } };
  assert.deepEqual(decodeAreaLink(encodeAreaLink(multi)).outline, multi.outline);
  assert.deepEqual(decodeAreaLink(encodeAreaLink(line)).outline, line.outline);
});

test('an area with no label and no leaders decodes with neither', () => {
  const bare: AreaLinkData = { ...AREA, areaLabel: undefined, leaders: [] };
  const decoded = decodeAreaLink(encodeAreaLink(bare));
  assert.equal('areaLabel' in decoded, false);
  assert.deepEqual(decoded.leaders, []);
});

test('positions are rounded to 1e-5 degrees', () => {
  const precise: AreaLinkData = { ...AREA, circleCenter: [-93.123456789, 44.987654321] };
  assert.deepEqual(decodeAreaLink(encodeAreaLink(precise)).circleCenter, [-93.12346, 44.98765]);
});

test('a small area link keeps every point and puts the data after #', () => {
  const link = buildAreaLink(BASE_URL, AREA);
  assert.equal(link.pointsKept, 5);
  assert.equal(link.pointsIn, 5);
  assert.ok(link.url.startsWith(`${BASE_URL}#`));
  assert.deepEqual(decodeAreaLink(new URL(link.url).hash.slice(1)), AREA);
});

test('a detailed outline is simplified until the link fits one QR code', () => {
  const detailed: AreaLinkData = { ...AREA, outline: { type: 'Polygon', coordinates: [wobblyRing(4000)] } };
  assert.ok(encodeAreaLink(detailed).length > QR_MAX_BYTES_MEDIUM);
  const link = buildAreaLink(BASE_URL, detailed);
  assert.ok(new TextEncoder().encode(link.url).length <= QR_MAX_BYTES_MEDIUM);
  assert.equal(link.pointsIn, 4001);
  assert.ok(link.pointsKept < link.pointsIn);
  assert.equal(decodeAreaLink(new URL(link.url).hash.slice(1)).circleName, AREA.circleName);
});

test('an area that cannot fit even simplified throws AreaLinkTooLargeError', () => {
  const huge: AreaLinkData = { ...AREA, circleName: incompressibleText(3000) };
  assert.throws(() => buildAreaLink(BASE_URL, huge), AreaLinkTooLargeError);
});

const NOTE = 'Meet at the nature center lot at 7.\nFeeders at 12 Elm St. are OK.\n\nNo entry past the gate.';

test('an area note decodes with its line breaks', () => {
  const decoded = decodeAreaLink(encodeAreaLink({ ...AREA, note: NOTE }));
  assert.deepEqual(decoded, { ...AREA, note: NOTE });
});

test('a blank note is left out of the link', () => {
  const decoded = decodeAreaLink(encodeAreaLink({ ...AREA, note: ' \n ' }));
  assert.equal('note' in decoded, false);
  assert.equal(encodeAreaLink({ ...AREA, note: ' \n ' }), encodeAreaLink(AREA));
});

test('a version 1 link still decodes, and a note field in it is ignored', () => {
  const decoded = decodeAreaLink(packedPayload({ ...VALID_PACKED, v: 1, m: 'Never written by version 1' }));
  assert.equal(decoded.areaCode, '12');
  assert.equal('note' in decoded, false);
});

test('a note of exactly the limit round trips', () => {
  const note = 'n'.repeat(AREA_NOTE_MAX_LENGTH);
  assert.equal(decodeAreaLink(encodeAreaLink({ ...AREA, note })).note, note);
});

test('encoding a note over the limit throws AreaNoteTooLongError', () => {
  assert.throws(
    () => buildAreaLink(BASE_URL, { ...AREA, note: 'n'.repeat(AREA_NOTE_MAX_LENGTH + 1) }),
    (err: unknown) => err instanceof AreaNoteTooLongError && err.length === AREA_NOTE_MAX_LENGTH + 1
  );
});

test('simplifying a detailed outline keeps the note whole', () => {
  const note = incompressibleText(AREA_NOTE_MAX_LENGTH);
  const detailed: AreaLinkData = { ...AREA, note, outline: { type: 'Polygon', coordinates: [wobblyRing(4000)] } };
  const link = buildAreaLink(BASE_URL, detailed);
  assert.ok(link.pointsKept < link.pointsIn);
  assert.equal(decodeAreaLink(new URL(link.url).hash.slice(1)).note, note);
});

test('the link reports its length in UTF-8 bytes', () => {
  const link = buildAreaLink(BASE_URL, { ...AREA, note: 'Café' });
  assert.equal(link.bytes, new TextEncoder().encode(link.url).length);
});

test('a link from an unknown format version throws UnsupportedAreaLinkVersionError', () => {
  assert.throws(
    () => decodeAreaLink(packedPayload({ ...VALID_PACKED, v: AREA_LINK_FORMAT_VERSION + 1 })),
    (err: unknown) => err instanceof UnsupportedAreaLinkVersionError && err.version === AREA_LINK_FORMAT_VERSION + 1
  );
});

test('the hand-packed fixture decodes, so the rejection cases below differ from it in one field each', () => {
  assert.equal(decodeAreaLink(packedPayload(VALID_PACKED)).areaCode, '12');
});

const REJECTED: readonly [string, string, string][] = [
  ['text that is not base64 deflate', 'not-a-link', 'not compressed area data'],
  ['a truncated link', encodeAreaLink(AREA).slice(0, 40), 'not compressed area data'],
  ['a payload longer than a QR code holds', 'A'.repeat(QR_MAX_BYTES_MEDIUM + 1), 'longer than a QR code holds'],
  ['a payload that is not an object', packedPayload([1, 2]), 'not an object'],
  ['a missing circle name', packedPayload({ ...VALID_PACKED, n: '' }), 'missing circle or area'],
  ['a center off the globe', packedPayload({ ...VALID_PACKED, o: [0, 9500000] }), 'position off the globe'],
  ['an unknown outline type', packedPayload({ ...VALID_PACKED, t: 'X' }), 'missing outline'],
  ['a polygon with two parts', packedPayload({ ...VALID_PACKED, p: [VALID_PACKED.p[0], VALID_PACKED.p[0]] }), 'malformed outline'],
  ['a ring of three points', packedPayload({ ...VALID_PACKED, p: [[[-9330001, 4490001, 10001, 0, 0, 10001]]] }), 'malformed outline'],
  ['a leader with no name', packedPayload({ ...VALID_PACKED, l: [{ e: 'x@example.test' }] }), 'malformed leader'],
  ['a leader phone that is not text', packedPayload({ ...VALID_PACKED, l: [{ n: 'Pat', p: 5 }] }), 'malformed leader'],
  ['a note that is not text', packedPayload({ ...VALID_PACKED, m: 42 }), 'malformed note'],
  ['a blank note', packedPayload({ ...VALID_PACKED, m: '  ' }), 'malformed note'],
  ['a note over the limit', packedPayload({ ...VALID_PACKED, m: 'n'.repeat(AREA_NOTE_MAX_LENGTH + 1) }), 'malformed note'],
  ['an outline over 20,000 points', packedPayload({ ...VALID_PACKED, t: 'L', p: [[[0, 0, ...Array(40_002).fill(0)]]] }), 'too many points'],
];

for (const [name, payload, reason] of REJECTED) {
  test(`${name} throws InvalidAreaLinkError: ${reason}`, () => {
    assert.throws(
      () => decodeAreaLink(payload),
      (err: unknown) => err instanceof InvalidAreaLinkError && err.reason === reason
    );
  });
}
