import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionsUrl } from './directions.ts';

const PIXEL_CHROME = 'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';
const lakeHarriet = { lat: 44.9221, lng: -93.3065 };

test('opens Apple Maps directions on an iPhone', () => {
  assert.equal(directionsUrl(lakeHarriet, IPHONE_SAFARI, 5), 'https://maps.apple.com/?daddr=44.9221%2C-93.3065');
});

test('opens Apple Maps directions on an iPad that reports a Mac user agent', () => {
  assert.equal(directionsUrl(lakeHarriet, MAC_SAFARI, 5), 'https://maps.apple.com/?daddr=44.9221%2C-93.3065');
});

test('opens Google Maps directions on Android', () => {
  assert.equal(
    directionsUrl(lakeHarriet, PIXEL_CHROME, 5),
    'https://www.google.com/maps/dir/?api=1&destination=44.9221%2C-93.3065'
  );
});

test('opens Google Maps directions on a Mac computer', () => {
  assert.equal(
    directionsUrl(lakeHarriet, MAC_SAFARI, 0),
    'https://www.google.com/maps/dir/?api=1&destination=44.9221%2C-93.3065'
  );
});
