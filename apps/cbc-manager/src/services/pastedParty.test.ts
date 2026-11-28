import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import { toBase64Url } from './base64Url.ts';
import { encodePartyCode, partyCodeLine, type PartyEffort } from './partyCode.ts';
import {
  NEWER_PARTY_MESSAGE,
  partyCodesInText,
  partyFromEffort,
  readPastedParty,
  SEVERAL_PARTIES_MESSAGE,
  UNREADABLE_PARTY_MESSAGE,
} from './pastedParty.ts';

const START_TIME = new Date(2026, 11, 19, 7, 30).getTime();

const EFFORT: PartyEffort = {
  partyId: 'party-1',
  area: { circleCode: 'mnbl', areaCode: '12a' },
  startTime: START_TIME,
  stopTime: START_TIME + 8 * 60 * 60_000,
  participants: 3,
  carHours: 5.25,
  footHours: 2.75,
  feederHours: 0,
  carMiles: 41.5,
  footMiles: 3.2,
  route: [
    [
      [-93.25, 44.95],
      [-93.24, 44.96],
    ],
  ],
};

const AREAS = ['1', '12A'];
const SEASONS = [2026, 2025];

function message(effort: PartyEffort): string {
  return ['Christmas Bird Count party effort', 'Area #: 12A', 'Participants: 3', partyCodeLine(effort)].join('\n');
}

function read(text: string, seasons: readonly number[] = SEASONS) {
  return readPastedParty(text, 'MNBL', AREAS, seasons);
}

test('a pasted message gives its party, the circle spelling of its area, and the season of its date', () => {
  assert.deepEqual(read(message(EFFORT)), { status: 'read', effort: EFFORT, areaCode: '12A', season: 2026 });
});

test('the party code is found by its label after lines a mail app adds', () => {
  const text = `${message(EFFORT)}\n\nSent from my phone`;
  assert.equal(read(text).status, 'read');
});

test('a quoted reply repeating the same party code reads as one party', () => {
  const text = `Got it, thanks\n\n> ${partyCodeLine(EFFORT)}\n${message(EFFORT)}`;
  assert.equal(partyCodesInText(text).length, 1);
  assert.equal(read(text).status, 'read');
});

test('two different party codes are refused', () => {
  const other = { ...EFFORT, partyId: 'party-2' };
  assert.deepEqual(read(`${message(EFFORT)}\n${message(other)}`), {
    status: 'failed',
    message: SEVERAL_PARTIES_MESSAGE,
  });
});

test('text with no party code line is refused', () => {
  assert.deepEqual(read(encodePartyCode(EFFORT)), { status: 'failed', message: UNREADABLE_PARTY_MESSAGE });
});

test('a party code cut short by a line wrap is refused as unreadable', () => {
  const line = partyCodeLine(EFFORT);
  const wrapped = `${line.slice(0, 30)}\n${line.slice(30)}`;
  assert.deepEqual(read(wrapped), { status: 'failed', message: UNREADABLE_PARTY_MESSAGE });
});

test('a party code from a newer CBC Scout says to update', () => {
  const payload = toBase64Url(deflateSync(strToU8(JSON.stringify({ v: 99, p: 'party-1' }))));
  assert.deepEqual(read(`Party code: ${payload}`), { status: 'failed', message: NEWER_PARTY_MESSAGE });
});

test('a party for another circle is refused and names that circle', () => {
  const other = { ...EFFORT, area: { circleCode: 'INBL', areaCode: '12A' } };
  assert.deepEqual(read(message(other)), {
    status: 'failed',
    message: 'This party is for circle INBL. Open that circle, then paste again.',
  });
});

test('a party with no area goes to the open circle and leaves the area to the compiler', () => {
  const result = read(message({ ...EFFORT, area: null }));
  assert.equal(result.status === 'read' && result.areaCode, null);
});

test('an area the circle does not have is left to the compiler', () => {
  const result = read(message({ ...EFFORT, area: { circleCode: 'MNBL', areaCode: '99' } }));
  assert.equal(result.status === 'read' && result.areaCode, null);
});

test('a date in a season the circle does not have leaves the season to the compiler', () => {
  const result = read(message(EFFORT), [2025]);
  assert.equal(result.status === 'read' && result.season, null);
});

test('a date outside every count window leaves the season to the compiler', () => {
  const november = new Date(2026, 10, 20, 9).getTime();
  const result = read(message({ ...EFFORT, startTime: november, stopTime: november + 60_000 }));
  assert.equal(result.status === 'read' && result.season, null);
});

test('a party row takes every value from the code and the chosen area', () => {
  assert.deepEqual(partyFromEffort(EFFORT, '1'), {
    party_id: 'party-1',
    area_code: '1',
    start_time: START_TIME,
    stop_time: START_TIME + 8 * 60 * 60_000,
    participants: 3,
    car_hours: 5.25,
    foot_hours: 2.75,
    feeder_hours: 0,
    car_miles: 41.5,
    foot_miles: 3.2,
  });
});
