import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuScreens, screenTitle, UnknownScreenError } from './screens.ts';

const APP_SCREENS = [{ id: 'trips', title: 'Your trips' }] as const;

test("the menu lists the app's screens before the core's", () => {
  assert.deepEqual(
    menuScreens(APP_SCREENS).map((screen) => screen.id),
    ['trips', 'ebird-key', 'settings', 'help', 'about']
  );
});

test('with no app screens the menu lists only the core screens', () => {
  assert.deepEqual(
    menuScreens([]).map((screen) => screen.title),
    ['eBird key', 'Settings', 'Help', 'About']
  );
});

test("a screen's title comes from the app's list or the core's", () => {
  assert.equal(screenTitle('trips', APP_SCREENS), 'Your trips');
  assert.equal(screenTitle('settings', APP_SCREENS), 'Settings');
});

test('a screen in neither list fails with the screen named', () => {
  assert.throws(
    () => screenTitle('trips', []),
    (error: unknown) => error instanceof UnknownScreenError && error.screen === 'trips'
  );
});
