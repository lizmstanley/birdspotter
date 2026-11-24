import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationDeniedMessage } from './locationHelp.ts';

const PIXEL_CHROME = 'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';

test('gives iPhone Settings steps on an iPhone', () => {
  assert.match(locationDeniedMessage(IPHONE_SAFARI, 5), /Settings app.*Safari Websites/);
});

test('gives iPhone Settings steps on an iPad that reports a Mac user agent', () => {
  assert.match(locationDeniedMessage(MAC_SAFARI, 5), /Safari Websites/);
});

test('gives Chrome site settings steps on Android', () => {
  assert.match(locationDeniedMessage(PIXEL_CHROME, 5), /Chrome.*Site settings, Location/);
});

test('gives browser settings steps on a computer', () => {
  assert.match(locationDeniedMessage(MAC_SAFARI, 0), /browser settings/);
});
