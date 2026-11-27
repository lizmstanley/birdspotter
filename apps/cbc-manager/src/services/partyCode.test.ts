import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import {
  decodePartyCode,
  encodePartyCode,
  InvalidPartyCodeError,
  PARTY_CODE_FORMAT_VERSION,
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
};

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
    ['too long', 'A'.repeat(1004), 'too long'],
  ];
  for (const [name, payload, reason] of cases) {
    await t.test(name, () =>
      assert.throws(() => decodePartyCode(payload), (err) => err instanceof InvalidPartyCodeError && err.reason === reason)
    );
  }
});
