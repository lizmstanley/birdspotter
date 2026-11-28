import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePartyCode } from '@birdspotter/cbc-manager/services/partyCode.ts';
import { startSession, withBreak, withFeederHours, withFix, withParticipants } from './countSession.ts';
import { sessionSummaryText } from './sessionSummary.ts';
import { fixAt, MINUTE_MS, START_TIME } from './testing/routeFixtures.ts';

process.env.TZ = 'America/Chicago';

const TOTALS = { totalHours: 9.5, footHours: 4.125, carHours: 5.375, footMiles: 3.2, carMiles: 41.856, gapMiles: 1.004 };

const PARTY_ID = '0f8b6c1e-2d4a-4b7e-9c3f-5a6d7e8f9a0b';

function partyCodeOf(text: string): ReturnType<typeof decodePartyCode> {
  const payload = /^Party code: (\S+)$/.exec(text.split('\n').at(-1) ?? '')?.[1];
  assert.ok(payload, 'the last line is the party code');
  return decodePartyCode(payload);
}

test('writes the count sheet fields in the sheet order, with the area and a gap note', () => {
  const started = startSession(START_TIME, { name: 'Bloomington: Area 12, Richfield', code: '12', circleCode: 'MNBL' }, PARTY_ID);
  const session = { ...withFeederHours(withParticipants(started, 3), 0.5), stopTime: START_TIME + 570 * MINUTE_MS };
  const text = sessionSummaryText(session, TOTALS, 'mi');
  assert.equal(
    text.split('\n').slice(0, -1).join('\n'),
    [
      'Christmas Bird Count party effort',
      'Area #: 12',
      'Bloomington: Area 12, Richfield',
      'Sat, Dec 19, 2026, 7:00 AM to 4:30 PM',
      'Participants: 3',
      'Parties: 1',
      'Hours by vehicle: 5.38',
      'Hours by foot: 4.13',
      'Hours feeder watching: 0.50',
      'Miles by vehicle: 41.86',
      'Miles by foot: 3.20',
      '1.00 of these miles are straight lines across gaps in the route.',
    ].join('\n')
  );
  assert.deepEqual(partyCodeOf(text), {
    partyId: PARTY_ID,
    area: { circleCode: 'MNBL', areaCode: '12' },
    startTime: START_TIME,
    stopTime: START_TIME + 570 * MINUTE_MS,
    participants: 3,
    carHours: 5.38,
    footHours: 4.13,
    feederHours: 0.5,
    carMiles: 41.86,
    footMiles: 3.2,
    route: [],
  });
  assert.doesNotMatch(text, /:\/\//);
});

test('puts each recorded run in the party code as its own line, so no line crosses a gap', () => {
  let session = startSession(START_TIME, null, PARTY_ID);
  for (const [metersNorth, minutes] of [[0, 1], [100, 2], [200, 3]]) session = withFix(session, fixAt(metersNorth, minutes));
  session = withBreak(session);
  session = withFix(session, fixAt(900, 20));
  session = withBreak(session);
  for (const [metersNorth, minutes] of [[1500, 30], [1600, 31]]) session = withFix(session, fixAt(metersNorth, minutes));
  const text = sessionSummaryText({ ...session, stopTime: START_TIME + 40 * MINUTE_MS }, TOTALS, 'mi');
  const route = partyCodeOf(text).route;
  assert.deepEqual(
    route.map((line) => line.length),
    [3, 2]
  );
  assert.deepEqual(route[1][0], [fixAt(1500, 30).lng, Math.round(fixAt(1500, 30).lat * 1e5) / 1e5]);
});

test('leaves out the area lines with no area and the gap note with no gaps', () => {
  const session = { ...startSession(START_TIME, null), stopTime: START_TIME + MINUTE_MS };
  const text = sessionSummaryText(session, { ...TOTALS, gapMiles: 0 }, 'mi');
  assert.doesNotMatch(text, /Area #|Bloomington|gaps/);
  assert.match(text, /^Participants: 1$/m);
  assert.match(text, /^Hours feeder watching: 0\.00$/m);
  assert.equal(partyCodeOf(text).area, null);
});

test('in kilometers, names the unit on each distance line and keeps miles in the party code', () => {
  const session = { ...startSession(START_TIME, null, PARTY_ID), stopTime: START_TIME + MINUTE_MS };
  const text = sessionSummaryText(session, TOTALS, 'km');
  assert.match(text, /^Km by vehicle: 67\.36$/m);
  assert.match(text, /^Km by foot: 5\.15$/m);
  assert.match(text, /^1\.62 of these kilometers are straight lines across gaps in the route\.$/m);
  assert.doesNotMatch(text, /Miles|miles/);
  const code = partyCodeOf(text);
  assert.equal(code.carMiles, 41.86);
  assert.equal(code.footMiles, 3.2);
});
