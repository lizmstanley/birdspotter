import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, stopSession, withBreak, withCorrection, withFix, type CountSession } from './countSession.ts';
import { sessionStretches, sessionTotals } from './sessionStretches.ts';
import { fixAt, MINUTE_MS, START_TIME } from './testing/routeFixtures.ts';

const METERS_PER_MILE = 1609.344;

/** Fixes every minute from `fromMinute`, moving `metersPerMinute` north from `fromMeters`. */
function walk(session: CountSession, fromMeters: number, fromMinute: number, minutes: number, metersPerMinute: number) {
  let current = session;
  for (let step = 1; step <= minutes; step += 1) {
    current = withFix(current, fixAt(fromMeters + step * metersPerMinute, fromMinute + step));
  }
  return current;
}

function started(): CountSession {
  return withFix(startSession(START_TIME, null), fixAt(0, 0));
}

function near(actual: number, expected: number, tolerance = 0.005): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not near ${expected}`);
}

test('a slow route is one stretch on foot with its miles', () => {
  const session = walk(started(), 0, 0, 20, 80);
  const stretches = sessionStretches(session);
  assert.deepEqual(
    stretches.map((stretch) => stretch.mode),
    ['foot']
  );
  near(stretches[0].miles, 1600 / METERS_PER_MILE);
});

test('a fast stretch after walking is by car', () => {
  const session = walk(walk(started(), 0, 0, 10, 80), 800, 10, 10, 800);
  const stretches = sessionStretches(session);
  assert.deepEqual(
    stretches.map((stretch) => stretch.mode),
    ['foot', 'car']
  );
  near(stretches[1].miles, 8000 / METERS_PER_MILE);
});

test('a short run of the other mode joins the stretch before it', () => {
  const walked = walk(started(), 0, 0, 10, 80);
  const burst = walk(walked, 800, 10, 1, 600);
  const session = walk(burst, 1400, 11, 10, 80);
  assert.deepEqual(
    sessionStretches(session).map((stretch) => stretch.mode),
    ['foot']
  );
});

test('a gap is a straight line, counted in the miles and in the gap miles', () => {
  const beforeGap = walk(started(), 0, 0, 5, 80);
  const session = walk(withFix(withBreak(beforeGap), fixAt(2400, 15)), 2400, 15, 5, 80);
  const stretches = sessionStretches(session);
  assert.deepEqual(
    stretches.map((stretch) => [stretch.mode, stretch.isGap]),
    [
      ['foot', false],
      ['car', true],
      ['foot', false],
    ]
  );
  near(stretches[1].miles, 2000 / METERS_PER_MILE);
  const totals = sessionTotals(session, stretches, START_TIME + 20 * MINUTE_MS);
  near(totals.gapMiles, 2000 / METERS_PER_MILE);
  near(totals.carMiles, 2000 / METERS_PER_MILE);
  near(totals.footMiles, 800 / METERS_PER_MILE);
});

test('a corrected stretch keeps its mode as more points arrive', () => {
  const walked = walk(started(), 0, 0, 10, 80);
  const [stretch] = sessionStretches(walked);
  const corrected = withCorrection(walked, { from: stretch.startTime, to: stretch.endTime, mode: 'car' });
  const session = walk(corrected, 800, 10, 10, 80);
  const stretches = sessionStretches(session);
  assert.deepEqual(
    stretches.map((item) => [item.mode, item.startTime, item.endTime]),
    [
      ['car', START_TIME, START_TIME + 10 * MINUTE_MS],
      ['foot', START_TIME + 10 * MINUTE_MS, START_TIME + 20 * MINUTE_MS],
    ]
  );
});

test('foot and car hours add up to the time from start to stop, edges going to the nearest stretch', () => {
  const firstFix = withFix(startSession(START_TIME, null), fixAt(0, 10));
  const driven = walk(firstFix, 0, 10, 20, 800);
  const walked = walk(driven, 16_000, 30, 20, 80);
  const session = stopSession(walked, START_TIME + 60 * MINUTE_MS);
  const totals = sessionTotals(session, sessionStretches(session), Date.now());
  near(totals.totalHours, 1);
  near(totals.carHours, 30 / 60);
  near(totals.footHours, 30 / 60);
});

test('with no route, all the time is on foot and no miles', () => {
  const session = startSession(START_TIME, null);
  const totals = sessionTotals(session, sessionStretches(session), START_TIME + 90 * MINUTE_MS);
  assert.deepEqual(totals, { totalHours: 1.5, footHours: 1.5, carHours: 0, footMiles: 0, carMiles: 0, gapMiles: 0 });
});
