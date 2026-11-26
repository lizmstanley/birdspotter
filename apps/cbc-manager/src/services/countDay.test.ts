import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areResultsDue, countDateInSeason, parseCountDate } from './countDay.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

test('results are not due the day before count day', () => {
  assert.equal(areResultsDue('2026-12-19', at(2026, 12, 18, 23)), false);
});

test('results are due from early on count day', () => {
  assert.equal(areResultsDue('2026-12-19', at(2026, 12, 19, 0)), true);
});

test('results stay due after count day', () => {
  assert.equal(areResultsDue('2026-12-19', at(2027, 1, 5)), true);
});

test('reads the M/D/YYYY form', () => {
  assert.equal(areResultsDue('12/17/2026', at(2026, 12, 16)), false);
  assert.equal(areResultsDue('12/17/2026', at(2026, 12, 17)), true);
});

test('a missing or unreadable count date means results are due', () => {
  assert.equal(areResultsDue(null, at(2026, 1, 1)), true);
  assert.equal(areResultsDue('next Saturday', at(2026, 1, 1)), true);
});

test('rejects impossible dates instead of rolling them over', () => {
  assert.equal(parseCountDate('2026-02-31'), null);
});

test('with no count date, results are due once the season window opens', () => {
  assert.equal(areResultsDue(null, at(2026, 12, 13), 2026), false);
  assert.equal(areResultsDue(null, at(2026, 12, 14), 2026), true);
});

test('a count date wins over the season window', () => {
  assert.equal(areResultsDue('2026-12-19', at(2026, 12, 15), 2026), false);
});

test('a count date outside the season window is ignored and the window opening is used', () => {
  assert.equal(areResultsDue('2025-12-19', at(2026, 12, 13), 2026), false);
  assert.equal(areResultsDue('2025-12-19', at(2026, 12, 14), 2026), true);
});

test('the count window runs from Dec 14 through Jan 5', () => {
  assert.equal(countDateInSeason('2026-12-13', 2026), null);
  assert.equal(countDateInSeason('2026-12-14', 2026), '2026-12-14');
  assert.equal(countDateInSeason('1/5/2027', 2026), '2027-01-05');
  assert.equal(countDateInSeason('2027-01-06', 2026), null);
});

test('a date in the window of another season is refused', () => {
  assert.equal(countDateInSeason('2025-12-20', 2026), null);
  assert.equal(countDateInSeason('2027-12-20', 2026), null);
});

test('a day that does not exist is refused', () => {
  assert.equal(countDateInSeason('12/32/2026', 2026), null);
  assert.equal(countDateInSeason(null, 2026), null);
});
