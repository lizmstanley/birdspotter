import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseInstallOffer, isRunningInstalled, type InstallContext } from './installOffer.ts';

const PIXEL_CHROME = 'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';

function context(overrides: Partial<InstallContext>): InstallContext {
  return { isRunningInstalled: false, hasInstallPrompt: false, userAgent: PIXEL_CHROME, maxTouchPoints: 5, ...overrides };
}

test('offers the install button when Chrome has a prompt ready', () => {
  assert.equal(chooseInstallOffer(context({ hasInstallPrompt: true })), 'install-button');
});

test('offers nothing on Android before Chrome has a prompt ready', () => {
  assert.equal(chooseInstallOffer(context({})), 'none');
});

test('offers the share-sheet steps on iPhone', () => {
  assert.equal(chooseInstallOffer(context({ userAgent: IPHONE_SAFARI })), 'ios-steps');
});

test('offers the share-sheet steps on an iPad that reports a Mac user agent', () => {
  assert.equal(chooseInstallOffer(context({ userAgent: IPAD_SAFARI, maxTouchPoints: 5 })), 'ios-steps');
});

test('offers nothing on a Mac without a touch screen', () => {
  assert.equal(chooseInstallOffer(context({ userAgent: IPAD_SAFARI, maxTouchPoints: 0 })), 'none');
});

test('offers nothing once running installed, even with a prompt or on iPhone', () => {
  assert.equal(chooseInstallOffer(context({ isRunningInstalled: true, hasInstallPrompt: true })), 'none');
  assert.equal(chooseInstallOffer(context({ isRunningInstalled: true, userAgent: IPHONE_SAFARI })), 'none');
});

function fakeWindow(isStandaloneDisplay: boolean, iosStandalone?: boolean): Window {
  return {
    matchMedia: (query: string) => ({ matches: isStandaloneDisplay && query === '(display-mode: standalone)' }),
    navigator: { standalone: iosStandalone },
  } as unknown as Window;
}

test('reads an installed launch from the standalone display mode', () => {
  assert.equal(isRunningInstalled(fakeWindow(true)), true);
});

test('reads an installed launch on iOS from navigator.standalone', () => {
  assert.equal(isRunningInstalled(fakeWindow(false, true)), true);
});

test('reads a browser tab as not installed', () => {
  assert.equal(isRunningInstalled(fakeWindow(false, false)), false);
  assert.equal(isRunningInstalled(fakeWindow(false)), false);
});
