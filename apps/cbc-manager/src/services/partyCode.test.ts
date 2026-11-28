import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import type { Position } from 'geojson';
import {
  decodePartyCode,
  encodePartyCode,
  InvalidPartyCodeError,
  PARTY_CODE_FORMAT_VERSION,
  PARTY_CODE_LABEL,
  PARTY_CODE_MAX_LENGTH,
  partyCodeLine,
  UnsupportedPartyCodeVersionError,
  type PartyEffort,
} from './partyCode.ts';
import { toBase64Url } from './base64Url.ts';

const START_TIME = Date.UTC(2026, 11, 19, 13, 0);

const EFFORT: PartyEffort = {
  partyId: '0f8b6c1e-2d4a-4b7e-9c3f-5a6d7e8f9a0b',
  area: { circleCode: 'MNBL', areaCode: '12' },
  startTime: START_TIME,
  stopTime: START_TIME + 570 * 60_000,
  participants: 3,
  carHours: 5.375,
  footHours: 4.125,
  feederHours: 0.333,
  carMiles: 41.856,
  footMiles: 3.2,
  route: [
    [
      [-93.25, 44.95],
      [-93.24871, 44.95212],
      [-93.24, 44.96],
    ],
    [
      [-93.2, 44.9],
      [-93.21, 44.91],
    ],
  ],
};

const METERS_PER_DEGREE_LAT = 111_195;

/** A winding drive of about 25 m steps, the spacing a phone records at speed, with a few meters of fix jitter. */
function windingRoute(points: number): Position[] {
  const line: Position[] = [];
  let lng = -93.25;
  let lat = 44.95;
  let seed = 7;
  const jitterMeters = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 8;
  };
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < points; i += 1) {
    const heading = Math.sin(i / 23) * 1.2 + Math.sin(i / 157) * 2 + i / 900;
    lng += (25 * Math.sin(heading)) / metersPerDegreeLng;
    lat += (25 * Math.cos(heading)) / METERS_PER_DEGREE_LAT;
    line.push([lng + jitterMeters() / metersPerDegreeLng, lat + jitterMeters() / METERS_PER_DEGREE_LAT]);
  }
  return line;
}

function payloadOfLine(line: string): string {
  const prefix = `${PARTY_CODE_LABEL}: `;
  assert.ok(line.startsWith(prefix));
  return line.slice(prefix.length);
}

const VALID_PACKED = { v: PARTY_CODE_FORMAT_VERSION, p: 'party-1', s: 0, e: 1, n: 1, hv: 0, hf: 0, hw: 0, mv: 0, mf: 0 };

function payloadOf(value: unknown): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(value))));
}

test('reads back the party, with hours and miles to the hundredth the shared text shows', () => {
  assert.deepEqual(decodePartyCode(encodePartyCode(EFFORT)), {
    ...EFFORT,
    carHours: 5.38,
    footHours: 4.13,
    feederHours: 0.33,
    carMiles: 41.86,
  });
});

test('reads back a party with no area', () => {
  assert.equal(decodePartyCode(encodePartyCode({ ...EFFORT, area: null })).area, null);
});

test('leaves out a run of one point, and adds no route when no run has two', () => {
  const lone: Position[] = [[-93.3, 44.8]];
  assert.deepEqual(decodePartyCode(encodePartyCode({ ...EFFORT, route: [lone, ...EFFORT.route, []] })).route, EFFORT.route);
  const noRoute = encodePartyCode({ ...EFFORT, route: [lone, []] });
  assert.deepEqual(decodePartyCode(noRoute).route, []);
  assert.equal(noRoute, encodePartyCode({ ...EFFORT, route: [] }));
});

test('reads a version 1 code, made before the route, as a party with no route', () => {
  const effort = decodePartyCode(payloadOf({ ...VALID_PACKED, v: 1, r: [[0, 0, 1, 1]] }));
  assert.equal(effort.partyId, 'party-1');
  assert.deepEqual(effort.route, []);
});

test('simplifies a heavy day until the code fits, keeping each run and its ends', () => {
  const heavyDay = [windingRoute(3000), windingRoute(3000).map(([lng, lat]) => [lng + 0.2, lat])];
  assert.ok(encodePartyCode({ ...EFFORT, route: heavyDay }).length > PARTY_CODE_MAX_LENGTH * 4);
  const payload = payloadOfLine(partyCodeLine({ ...EFFORT, route: heavyDay }));
  assert.ok(payload.length <= PARTY_CODE_MAX_LENGTH, `${payload.length} characters`);
  const { route } = decodePartyCode(payload);
  assert.equal(route.length, 2);
  route.forEach((line, index) => {
    assert.ok(line.length > 20 && line.length < heavyDay[index].length, `${line.length} points kept`);
    assert.deepEqual(line[0], heavyDay[index][0].map((value) => Math.round(value * 1e5) / 1e5));
  });
});

test('keeps the route of a day broken into many runs, as when the counter switches apps often', () => {
  const day = windingRoute(6000);
  const runs = Array.from({ length: 150 }, (_, index) => day.slice(index * 40, index * 40 + 40));
  const { route } = decodePartyCode(payloadOfLine(partyCodeLine({ ...EFFORT, route: runs })));
  assert.equal(route.length, 150);
  assert.deepEqual(route[149].at(-1), day[5999].map((value) => Math.round(value * 1e5) / 1e5));
});

test('simplifies an even route whose every point would fit, so the reader takes it', () => {
  const straight = Array.from({ length: 10_001 }, (_, index): Position => [-93.25, 44 + index * 0.0002]);
  const { route } = decodePartyCode(payloadOfLine(partyCodeLine({ ...EFFORT, route: [straight] })));
  assert.equal(route.length, 1);
  assert.ok(route[0].length < 10_000);
});

test('keeps every point of a route that already fits', () => {
  const payload = payloadOfLine(partyCodeLine(EFFORT));
  assert.equal(payload, encodePartyCode(EFFORT));
});

test('leaves the route out when even the coarsest step does not fit, and keeps the totals', () => {
  let seed = 11;
  const anywhere = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 0.1;
  };
  const scattered = Array.from({ length: 600 }, (): Position[] => [
    [-93.3 + anywhere(), 44.9 + anywhere()],
    [-93.3 + anywhere(), 44.9 + anywhere()],
  ]);
  const payload = payloadOfLine(partyCodeLine({ ...EFFORT, route: scattered }));
  const effort = decodePartyCode(payload);
  assert.deepEqual(effort.route, []);
  assert.equal(effort.participants, EFFORT.participants);
});

test('labels the line and keeps the payload to base64url, so no link forms', () => {
  assert.match(partyCodeLine(EFFORT), /^Party code: [A-Za-z0-9_-]+$/);
});

test('rejects a version it does not read', () => {
  assert.throws(
    () => decodePartyCode(payloadOf({ ...VALID_PACKED, v: PARTY_CODE_FORMAT_VERSION + 1 })),
    UnsupportedPartyCodeVersionError
  );
});

test('rejects the payload cut at any point', () => {
  const payload = encodePartyCode(EFFORT);
  for (let length = 0; length < payload.length; length += 1) {
    assert.throws(() => decodePartyCode(payload.slice(0, length)), InvalidPartyCodeError, `cut to ${length}`);
  }
});

test('rejects damaged or malformed payloads', async (t) => {
  const cases: [string, string, string][] = [
    ['cut short', encodePartyCode(EFFORT).slice(0, 20), 'not compressed party data'],
    ['not base64url', 'not a code!', 'not compressed party data'],
    ['an array', payloadOf([VALID_PACKED]), 'not an object'],
    ['no party ID', payloadOf({ ...VALID_PACKED, p: '' }), 'malformed party ID'],
    ['a party ID too long', payloadOf({ ...VALID_PACKED, p: 'x'.repeat(65) }), 'malformed party ID'],
    ['an area with no circle', payloadOf({ ...VALID_PACKED, a: '12' }), 'malformed circle or area'],
    ['a circle with no area', payloadOf({ ...VALID_PACKED, c: 'MNBL' }), 'malformed circle or area'],
    ['times as text', payloadOf({ ...VALID_PACKED, s: '0' }), 'missing times'],
    ['a circle as a number', payloadOf({ ...VALID_PACKED, c: 5, a: '12' }), 'malformed circle or area'],
    ['stop before start', payloadOf({ ...VALID_PACKED, s: 2, e: 1 }), 'stop before start'],
    ['no participants', payloadOf({ ...VALID_PACKED, n: 0 }), 'malformed participants'],
    ['fractional participants', payloadOf({ ...VALID_PACKED, n: 1.5 }), 'malformed participants'],
    ['negative miles', payloadOf({ ...VALID_PACKED, mf: -1 }), 'malformed hours or miles'],
    ['hours as text', payloadOf({ ...VALID_PACKED, hv: '1' }), 'malformed hours or miles'],
    ['too long', 'A'.repeat(PARTY_CODE_MAX_LENGTH + 1), 'too long'],
    ['a route that is not a list', payloadOf({ ...VALID_PACKED, r: { a: 1 } }), 'malformed route'],
    ['a run of one point', payloadOf({ ...VALID_PACKED, r: [[-9325000, 4495000]] }), 'malformed route'],
    ['a run with a lone value', payloadOf({ ...VALID_PACKED, r: [[-9325000, 4495000, 1]] }), 'malformed route'],
    ['a fractional delta', payloadOf({ ...VALID_PACKED, r: [[-9325000, 4495000, 0.5, 1]] }), 'malformed route'],
    ['a run off the globe', payloadOf({ ...VALID_PACKED, r: [[-9325000, 4495000, 0, 9000000]] }), 'route off the globe'],
    [
      'too many route points',
      payloadOf({
        ...VALID_PACKED,
        r: [
          [-9325000, 4495000, ...new Array<number>(10_000).fill(0)],
          [0, 0, ...new Array<number>(10_000).fill(0)],
        ],
      }),
      'too many route points',
    ],
  ];
  for (const [name, payload, reason] of cases) {
    await t.test(name, () =>
      assert.throws(() => decodePartyCode(payload), (err) => err instanceof InvalidPartyCodeError && err.reason === reason)
    );
  }
});
