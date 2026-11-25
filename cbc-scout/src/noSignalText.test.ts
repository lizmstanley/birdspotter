import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchedTimeText, noSignalText } from './noSignalText.ts';

const SIGHTINGS_AT = new Date(2026, 11, 19, 9, 42).getTime();
const HOTSPOTS_AT = new Date(2026, 11, 19, 7, 10).getTime();

test('a fetch time shows the hour and minute', () => {
  assert.match(fetchedTimeText(SIGHTINGS_AT), /9:42/);
});

test('with no data held, the lists say there is no recent eBird data until a signal returns', () => {
  assert.equal(
    noSignalText(null, null),
    'No signal, and no eBird data from the last 6 hours. The lists fill in when a signal returns.'
  );
});

test('each list held names when eBird sent it', () => {
  assert.equal(
    noSignalText(SIGHTINGS_AT, HOTSPOTS_AT),
    `No signal. Showing sightings fetched at ${fetchedTimeText(SIGHTINGS_AT)} and hotspots fetched at ${fetchedTimeText(HOTSPOTS_AT)}.`
  );
});

test('a list with no data held says so beside the one that has data', () => {
  assert.equal(
    noSignalText(SIGHTINGS_AT, null),
    `No signal. Showing sightings fetched at ${fetchedTimeText(SIGHTINGS_AT)}. No hotspots from the last 6 hours.`
  );
  assert.equal(
    noSignalText(null, HOTSPOTS_AT),
    `No signal. Showing hotspots fetched at ${fetchedTimeText(HOTSPOTS_AT)}. No sightings from the last 6 hours.`
  );
});
