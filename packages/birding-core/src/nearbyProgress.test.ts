import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_TRACKING, type LiveLocation } from './locationTracking.ts';
import type { LngLat } from './nearby.ts';
import { nearbyProgressText } from './nearbyProgress.ts';

const CHOSEN_PLACE: LngLat = [-93.27, 44.98];
const BLOCKED: LiveLocation = { position: null, isTracking: false, error: 'Location is blocked.' };

test('with no origin and location off, asks for location', () => {
  assert.equal(
    nearbyProgressText(null, NOT_TRACKING, false),
    'Turn on location with the location button on the map to see what is nearby.'
  );
});

test('with no origin while tracking, says it is finding the location', () => {
  assert.equal(nearbyProgressText(null, { ...NOT_TRACKING, isTracking: true }, false), 'Finding your location…');
});

test('with no origin, shows the location error', () => {
  assert.equal(nearbyProgressText(null, BLOCKED, false), 'Location is blocked.');
});

test('with a chosen place and location blocked, says eBird data is loading', () => {
  assert.equal(nearbyProgressText(CHOSEN_PLACE, BLOCKED, true), 'Loading eBird data…');
});

test('with a chosen place and location off, shows nothing once loaded', () => {
  assert.equal(nearbyProgressText(CHOSEN_PLACE, NOT_TRACKING, false), null);
});
