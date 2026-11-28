import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWindowStart, seasonInPreparation, seasonOfCountDay, seasonToRollOverTo } from './season.ts';

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

test('the season stays the one just counted until September', () => {
  assert.equal(seasonInPreparation(on(2027, 1, 3)), 2026);
  assert.equal(seasonInPreparation(on(2027, 8, 31)), 2026);
});

test('September starts preparing the next season', () => {
  assert.equal(seasonInPreparation(on(2026, 9, 1)), 2026);
  assert.equal(seasonInPreparation(on(2026, 12, 31)), 2026);
});

test('a rollover is offered only when the circle is behind the season in preparation', () => {
  assert.equal(seasonToRollOverTo(2025, on(2026, 11, 23)), 2026);
  assert.equal(seasonToRollOverTo(2026, on(2026, 11, 23)), null);
  assert.equal(seasonToRollOverTo(2026, on(2027, 3, 1)), null);
});

test('a circle with no current season is offered nothing', () => {
  assert.equal(seasonToRollOverTo(null, on(2026, 11, 23)), null);
});

test('a season that was skipped still rolls to the latest', () => {
  assert.equal(seasonToRollOverTo(2023, on(2026, 11, 23)), 2026);
});

test('the count window opens December 14', () => {
  assert.deepEqual(countWindowStart(2026), on(2026, 12, 14));
});

const at = (y: number, m: number, d: number, hour: number) => new Date(y, m - 1, d, hour).getTime();

test('a count day maps to the season whose window holds its calendar date', () => {
  assert.equal(seasonOfCountDay(at(2026, 12, 14, 0)), 2026);
  assert.equal(seasonOfCountDay(at(2026, 12, 31, 23)), 2026);
  assert.equal(seasonOfCountDay(at(2027, 1, 5, 23)), 2026);
});

test('a day outside every count window maps to no season', () => {
  assert.equal(seasonOfCountDay(at(2026, 12, 13, 23)), null);
  assert.equal(seasonOfCountDay(at(2027, 1, 6, 0)), null);
  assert.equal(seasonOfCountDay(at(2026, 11, 20, 9)), null);
});
