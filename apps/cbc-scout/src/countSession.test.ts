import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readCountSession,
  SESSION_STORAGE_KEY,
  startSession,
  stopSession,
  withBreak,
  withCorrection,
  withFeederHours,
  withFix,
  withParticipants,
  writeCountSession,
  type CountSession,
  type LocationFix,
} from './countSession.ts';
import { MemoryStorage } from '@birdspotter/birding-core/testing/memoryStorage.ts';
import { fixAt, MINUTE_MS, START_TIME } from './testing/routeFixtures.ts';

function recorded(...fixes: LocationFix[]): CountSession {
  return fixes.reduce(withFix, startSession(START_TIME, null));
}

function pointCount(session: CountSession): number {
  return session.tracks.reduce((sum, track) => sum + track.length, 0);
}

test('keeps a fix that moved at least 20 meters and more than its accuracy', () => {
  const session = recorded(fixAt(0, 1), fixAt(25, 2));
  assert.equal(pointCount(session), 2);
});

test('drops jitter while standing still', () => {
  const session = recorded(fixAt(0, 1), fixAt(8, 2), fixAt(-12, 3), fixAt(15, 4));
  assert.equal(pointCount(session), 1);
});

test('drops a move smaller than the fix accuracy', () => {
  const session = recorded(fixAt(0, 1), fixAt(30, 2, 40));
  assert.equal(pointCount(session), 1);
});

test('drops rough fixes, fixes from before the start, and fixes no newer than the last point', () => {
  const session = recorded(fixAt(0, -1), fixAt(0, 1, 80), fixAt(0, 2), fixAt(100, 2), fixAt(200, 1.5));
  assert.deepEqual(session.tracks, [[{ lng: fixAt(0, 2).lng, lat: fixAt(0, 2).lat, time: fixAt(0, 2).time }]]);
});

test('records nothing after stop', () => {
  const stopped = stopSession(recorded(fixAt(0, 1)), START_TIME + 5 * MINUTE_MS);
  assert.equal(pointCount(withFix(stopped, fixAt(500, 6))), 1);
  assert.equal(stopSession(stopped, START_TIME + 9 * MINUTE_MS).stopTime, START_TIME + 5 * MINUTE_MS);
});

test('a break starts a new track whose first fix is kept even when close', () => {
  const session = withFix(withBreak(recorded(fixAt(0, 1))), fixAt(5, 10));
  assert.deepEqual(
    session.tracks.map((track) => track.length),
    [1, 1]
  );
});

test('repeated breaks with no fix between them leave one empty track', () => {
  const session = withBreak(withBreak(recorded(fixAt(0, 1))));
  assert.deepEqual(
    session.tracks.map((track) => track.length),
    [1, 0]
  );
});

test('gives each new count its own party ID', () => {
  assert.notEqual(startSession(START_TIME, null).partyId, startSession(START_TIME, null).partyId);
});

test('keeps the area, area number, and circle that were active at start', () => {
  const session = startSession(START_TIME, { name: 'Bloomington: Area 12, Richfield', code: '12', circleCode: 'MNBL' });
  assert.equal(session.areaName, 'Bloomington: Area 12, Richfield');
  assert.equal(session.areaCode, '12');
  assert.equal(session.circleCode, 'MNBL');
  const none = startSession(START_TIME, null);
  assert.deepEqual([none.areaName, none.areaCode, none.circleCode], [null, null, null]);
});

test('takes a whole number of participants of at least 1 and feeder hours of at least 0', () => {
  const session = startSession(START_TIME, null);
  assert.equal(withParticipants(session, 4).participants, 4);
  for (const bad of [0, -1, 2.5, Number.NaN]) assert.equal(withParticipants(session, bad), session, String(bad));
  assert.equal(withFeederHours(session, 1.25).feederHours, 1.25);
  assert.equal(withFeederHours(withFeederHours(session, 2), 0).feederHours, 0);
  for (const bad of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(withFeederHours(session, bad), session, String(bad));
  }
});

test('saves and restores a session with its area, party details, tracks, and corrections', () => {
  const storage = new MemoryStorage();
  const withGap = withFix(withBreak(recorded(fixAt(0, 1), fixAt(100, 3))), fixAt(900, 20));
  const withParty = withFeederHours(
    withParticipants({ ...withGap, areaName: 'Bloomington: Area 12, Richfield', areaCode: '12', circleCode: 'MNBL' }, 3),
    1.5
  );
  const session = stopSession(withCorrection(withParty, { from: 1, to: 2, mode: 'car' }), START_TIME + 30 * MINUTE_MS);
  assert.equal(writeCountSession(storage, session), true);
  const read = readCountSession(storage);
  assert.equal(read.status, 'found');
  if (read.status !== 'found') return;
  assert.equal(read.session.stopTime, session.stopTime);
  assert.equal(read.session.areaName, session.areaName);
  assert.equal(read.session.partyId, session.partyId);
  assert.equal(read.session.areaCode, '12');
  assert.equal(read.session.circleCode, 'MNBL');
  assert.equal(read.session.participants, 3);
  assert.equal(read.session.feederHours, 1.5);
  assert.deepEqual(read.session.corrections, session.corrections);
  assert.deepEqual(
    read.session.tracks.map((track) => track.map((point) => point.time)),
    session.tracks.map((track) => track.map((point) => point.time))
  );
  assert.ok(Math.abs(read.session.tracks[1][0].lat - session.tracks[1][0].lat) < 1e-6);
});

test('reports no session when nothing is saved', () => {
  assert.deepEqual(readCountSession(new MemoryStorage()), { status: 'none' });
});

test('reports a saved session it cannot read', () => {
  const good = JSON.parse(writeAndRead(startSession(START_TIME, null)));
  const cases = [
    'not json',
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, participants: 0 }),
    JSON.stringify({ ...good, participants: 1.5 }),
    JSON.stringify({ ...good, feederHours: -1 }),
    JSON.stringify({ ...good, areaCode: 12 }),
    JSON.stringify({ ...good, circleCode: 12 }),
    JSON.stringify({ ...good, partyId: '' }),
    JSON.stringify({ ...good, partyId: undefined }),
    JSON.stringify({ ...good, partyId: 12 }),
    JSON.stringify({ ...good, areaName: 12 }),
    JSON.stringify({ ...good, tracks: [[[1, 2]]] }),
    JSON.stringify({ ...good, corrections: [{ from: 1, to: 2, mode: 'boat' }] }),
    JSON.stringify({ ...good, stopTime: 'later' }),
  ];
  for (const text of cases) {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, text);
    assert.deepEqual(readCountSession(storage), { status: 'unreadable' }, text);
  }
});

test('reports a blocked save and removes the session when cleared', () => {
  const storage = new MemoryStorage();
  writeCountSession(storage, startSession(START_TIME, null));
  assert.equal(writeCountSession(storage, null), true);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
  storage.isBlocked = true;
  assert.equal(writeCountSession(storage, startSession(START_TIME, null)), false);
});

function writeAndRead(session: CountSession): string {
  const storage = new MemoryStorage();
  writeCountSession(storage, session);
  return storage.getItem(SESSION_STORAGE_KEY) ?? '';
}
