import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EBIRD_DATA_LIFETIME_MS } from '../../src/services/ebird.ts';
import {
  fetchAgainAt,
  heldAfterFailure,
  hotspotsDelayMs,
  isWithinLifetime,
  RETRY_AFTER_ERROR_MS,
  sightingsDelayMs,
} from './nearbyRefresh.ts';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const loaded = { error: null, isKeyRejected: false, hasNoSignal: false };
const failed = { error: 'ebird: the sightings request failed. (HTTP 503)', isKeyRejected: false, hasNoSignal: false };
const rejected = { error: 'eBird rejected the key.', isKeyRejected: true, hasNoSignal: false };
const savedForNoSignal = { error: null, isKeyRejected: false, hasNoSignal: true };
const noSignalNoCopy = { error: 'ebird: eBird could not be reached.', isKeyRejected: false, hasNoSignal: true };

test('sightings that loaded are fetched again at the refresh interval', () => {
  assert.equal(sightingsDelayMs(loaded, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
});

test('hotspots that loaded are not fetched again on a schedule', () => {
  assert.equal(hotspotsDelayMs(loaded, FIFTEEN_MINUTES_MS), null);
});

test('a failed fetch of either list is retried after a minute', () => {
  assert.equal(sightingsDelayMs(failed, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
  assert.equal(hotspotsDelayMs(failed, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
});

test('with no signal, either list is retried after a minute, with or without a saved copy', () => {
  for (const outcome of [savedForNoSignal, noSignalNoCopy]) {
    assert.equal(sightingsDelayMs(outcome, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
    assert.equal(hotspotsDelayMs(outcome, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
  }
});

test('after a rejected key, either list is tried again at the refresh interval', () => {
  assert.equal(sightingsDelayMs(rejected, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
  assert.equal(hotspotsDelayMs(rejected, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
});

test('data is shown until it is 6 hours old, and no data is never shown', () => {
  const fetchedAt = 1_000_000;
  assert.equal(isWithinLifetime(fetchedAt, fetchedAt + EBIRD_DATA_LIFETIME_MS - 1), true);
  assert.equal(isWithinLifetime(fetchedAt, fetchedAt + EBIRD_DATA_LIFETIME_MS), false);
  assert.equal(isWithinLifetime(null, fetchedAt), false);
});

test('after a failed fetch, held data stays until it is 6 hours old, then is dropped', () => {
  const fetchedAt = 1_000_000;
  const last = { data: ['row'], fetchedAt };
  assert.deepEqual(heldAfterFailure(last, fetchedAt + EBIRD_DATA_LIFETIME_MS - 1, false), last);
  assert.equal(heldAfterFailure(last, fetchedAt + EBIRD_DATA_LIFETIME_MS, false), null);
  assert.equal(heldAfterFailure({ data: [], fetchedAt: null }, fetchedAt, false), null);
  assert.equal(heldAfterFailure(null, fetchedAt, false), null);
});

test('after eBird rejects the key, data fetched under the earlier key is dropped', () => {
  const fetchedAt = 1_000_000;
  assert.equal(heldAfterFailure({ data: ['row'], fetchedAt }, fetchedAt + 1000, true), null);
});

test('a list is fetched again after its delay, or when its data turns 6 hours old if that comes first', () => {
  const now = 50_000_000;
  const oldFetch = now - EBIRD_DATA_LIFETIME_MS + 1000;
  assert.equal(fetchAgainAt(now, FIFTEEN_MINUTES_MS, now), now + FIFTEEN_MINUTES_MS);
  assert.equal(fetchAgainAt(now, FIFTEEN_MINUTES_MS, oldFetch), oldFetch + EBIRD_DATA_LIFETIME_MS);
  assert.equal(fetchAgainAt(now, null, oldFetch), oldFetch + EBIRD_DATA_LIFETIME_MS);
  assert.equal(fetchAgainAt(now, RETRY_AFTER_ERROR_MS, null), now + RETRY_AFTER_ERROR_MS);
  assert.equal(fetchAgainAt(now, null, null), null);
});
