import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession } from './countSession.ts';
import { sessionSummaryText } from './sessionSummary.ts';
import { MINUTE_MS, START_TIME } from './testing/routeFixtures.ts';

process.env.TZ = 'America/Chicago';

const TOTALS = { totalHours: 9.5, footHours: 4.125, carHours: 5.375, footMiles: 3.2, carMiles: 41.856, gapMiles: 1.004 };

test('writes the totals as text with the area, date, and times', () => {
  const session = {
    ...startSession(START_TIME, 'Minneapolis North: 12 - Richfield'),
    stopTime: START_TIME + 570 * MINUTE_MS,
  };
  assert.equal(
    sessionSummaryText(session, TOTALS),
    [
      'Christmas Bird Count party effort',
      'Minneapolis North: 12 - Richfield',
      'Sat, Dec 19, 2026, 7:00 AM to 4:30 PM',
      'Total: 9.50 hours',
      'On foot: 4.13 hours, 3.20 miles',
      'By car: 5.38 hours, 41.86 miles',
      'Miles from gaps in the route (straight line): 1.00',
    ].join('\n')
  );
});

test('leaves out the area line when the count had no area', () => {
  const session = { ...startSession(START_TIME, null), stopTime: START_TIME + MINUTE_MS };
  assert.doesNotMatch(sessionSummaryText(session, TOTALS), /Richfield/);
  assert.equal(sessionSummaryText(session, TOTALS).split('\n').length, 6);
});
