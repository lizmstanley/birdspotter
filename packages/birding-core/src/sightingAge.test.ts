import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sightingAgeText } from './sightingAge.ts';

const NOW = new Date(2026, 10, 27, 12, 0, 30);

test('a report under a minute old says just now', () => {
  assert.equal(sightingAgeText('2026-11-27 12:00', NOW), 'just now');
});

test('a report with a time later than the phone clock says just now', () => {
  assert.equal(sightingAgeText('2026-11-27 13:15', NOW), 'just now');
});

test('a report under an hour old counts whole minutes', () => {
  assert.equal(sightingAgeText('2026-11-27 11:59', NOW), '1 minute ago');
  assert.equal(sightingAgeText('2026-11-27 11:20', NOW), '40 minutes ago');
  assert.equal(sightingAgeText('2026-11-27 11:01', NOW), '59 minutes ago');
});

test('a report under a day old counts whole hours, rounded down', () => {
  assert.equal(sightingAgeText('2026-11-27 11:00', NOW), '1 hour ago');
  assert.equal(sightingAgeText('2026-11-27 10:01', NOW), '1 hour ago');
  assert.equal(sightingAgeText('2026-11-27 09:00', NOW), '3 hours ago');
});

test('a timed report from the evening before, under a day old, still counts hours', () => {
  assert.equal(sightingAgeText('2026-11-26 13:00', NOW), '23 hours ago');
});

test('a timed report a day or more old counts calendar days', () => {
  assert.equal(sightingAgeText('2026-11-26 12:00', NOW), 'yesterday');
  assert.equal(sightingAgeText('2026-11-25 18:00', NOW), '2 days ago');
  assert.equal(sightingAgeText('2026-11-22 08:15', NOW), '5 days ago');
});

test('a date-only report counts calendar days', () => {
  assert.equal(sightingAgeText('2026-11-27', NOW), 'today');
  assert.equal(sightingAgeText('2026-11-26', NOW), 'yesterday');
  assert.equal(sightingAgeText('2026-11-22', NOW), '5 days ago');
});

test('a date-only report dated after the phone clock says today', () => {
  assert.equal(sightingAgeText('2026-11-28', NOW), 'today');
});

test('days count across the end of a month', () => {
  assert.equal(sightingAgeText('2026-11-30', new Date(2026, 11, 2, 9, 0)), '2 days ago');
});

test('a daylight saving change does not shift the day count', (t) => {
  const realTimeZone = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  t.after(() => {
    if (realTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = realTimeZone;
  });
  const afterShortDay = new Date(2026, 2, 9, 0, 30);
  assert.equal(sightingAgeText('2026-03-08', afterShortDay), 'yesterday');
  assert.equal(sightingAgeText('2026-03-07', afterShortDay), '2 days ago');
});

test('a timed report from earlier on a 25-hour day counts hours, not today', (t) => {
  const realTimeZone = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  t.after(() => {
    if (realTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = realTimeZone;
  });
  assert.equal(sightingAgeText('2026-11-01 00:30', new Date(2026, 10, 1, 23, 45)), '24 hours ago');
});

test('an obsDt in neither eBird form gives null', () => {
  for (const obsDt of ['', 'yesterday', '2026-11-27T08:15', '2026-11-27 8:15', '2026-11-27 08:15:00', '2026-13-01', '2026-02-30', '2026-11-27 24:00', '2026-11-27 08:60']) {
    assert.equal(sightingAgeText(obsDt, NOW), null, obsDt);
  }
});
