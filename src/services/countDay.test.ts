import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areResultsDue, parseCountDate } from './countDay.ts';

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
