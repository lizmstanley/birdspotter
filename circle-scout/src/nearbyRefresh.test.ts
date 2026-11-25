import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotspotsDelayMs, RETRY_AFTER_ERROR_MS, sightingsDelayMs } from './nearbyRefresh.ts';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const loaded = { error: null, isKeyRejected: false };
const dropped = { error: 'eBird could not be reached.', isKeyRejected: false };
const rejected = { error: 'eBird rejected the key.', isKeyRejected: true };

test('sightings that loaded are fetched again at the refresh interval', () => {
  assert.equal(sightingsDelayMs(loaded, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
});

test('hotspots that loaded are not fetched again on a schedule', () => {
  assert.equal(hotspotsDelayMs(loaded, FIFTEEN_MINUTES_MS), null);
});

test('a failed fetch of either list is retried after a minute', () => {
  assert.equal(sightingsDelayMs(dropped, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
  assert.equal(hotspotsDelayMs(dropped, FIFTEEN_MINUTES_MS), RETRY_AFTER_ERROR_MS);
});

test('after a rejected key, either list is tried again at the refresh interval', () => {
  assert.equal(sightingsDelayMs(rejected, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
  assert.equal(hotspotsDelayMs(rejected, FIFTEEN_MINUTES_MS), FIFTEEN_MINUTES_MS);
});
