import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, withFeederHours, withParticipants } from './countSession.ts';
import { sessionSummaryText } from './sessionSummary.ts';
import { MINUTE_MS, START_TIME } from './testing/routeFixtures.ts';

process.env.TZ = 'America/Chicago';

const TOTALS = { totalHours: 9.5, footHours: 4.125, carHours: 5.375, footMiles: 3.2, carMiles: 41.856, gapMiles: 1.004 };

test('writes the count sheet fields in the sheet order, with the area and a gap note', () => {
  const started = startSession(START_TIME, { name: 'Bloomington: Area 12, Richfield', code: '12' });
  const session = { ...withFeederHours(withParticipants(started, 3), 0.5), stopTime: START_TIME + 570 * MINUTE_MS };
  assert.equal(
    sessionSummaryText(session, TOTALS),
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
});

test('leaves out the area lines with no area and the gap note with no gaps', () => {
  const session = { ...startSession(START_TIME, null), stopTime: START_TIME + MINUTE_MS };
  const text = sessionSummaryText(session, { ...TOTALS, gapMiles: 0 });
  assert.doesNotMatch(text, /Area #|Bloomington|gaps/);
  assert.match(text, /^Participants: 1$/m);
  assert.match(text, /^Hours feeder watching: 0\.00$/m);
});
