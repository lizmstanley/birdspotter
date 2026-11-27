import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGED_LINK_MESSAGE } from './areaLinkText.ts';
import {
  BROWSER_TAB_NOTICE,
  startSavedAreas,
  STORAGE_BLOCKED_MESSAGE,
  takeAreaLinkFromAddress,
  unreadableAreasMessage,
} from './areaStartup.ts';
import { AREAS_STORAGE_KEY, readSavedAreas } from './savedAreas.ts';
import { MemoryStorage } from '@birdspotter/birding-core/testing/memoryStorage.ts';
import { areaPayload, SCOUT_URL } from './testing/areaFixtures.ts';

const LINK = `${SCOUT_URL}#${areaPayload()}`;

test('an opening link is saved and made active in the installed app', () => {
  const storage = new MemoryStorage();
  const startup = startSavedAreas(storage, LINK, true);
  assert.equal(startup.saved.activeKey, 'MNMI/12');
  assert.deepEqual(startup, { saved: startup.saved, isSavedListRead: true, error: null, notice: null });
  assert.equal(readSavedAreas(storage).saved.activeKey, 'MNMI/12');
});

test('an opening link in a browser tab warns that the installed app keeps its own areas', () => {
  const startup = startSavedAreas(new MemoryStorage(), LINK, false);
  assert.equal(startup.notice, BROWSER_TAB_NOTICE);
  assert.equal(startup.saved.areas.length, 1);
});

test('a damaged opening link reports the error and keeps saved areas', () => {
  const storage = new MemoryStorage();
  startSavedAreas(storage, LINK, true);
  const startup = startSavedAreas(storage, `${SCOUT_URL}#broken`, false);
  assert.equal(startup.error, DAMAGED_LINK_MESSAGE);
  assert.equal(startup.notice, null);
  assert.equal(startup.saved.areas.length, 1);
});

test('unreadable saved areas are reported once and removed from storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(AREAS_STORAGE_KEY, JSON.stringify(['damaged']));
  assert.equal(startSavedAreas(storage, null, true).error, unreadableAreasMessage(1));
  assert.equal(storage.getItem(AREAS_STORAGE_KEY), '[]');
  assert.equal(startSavedAreas(storage, null, true).error, null);
});

test('blocked storage still loads the opening link for this session', () => {
  const storage = new MemoryStorage();
  storage.isBlocked = true;
  const startup = startSavedAreas(storage, LINK, true);
  assert.equal(startup.saved.activeKey, 'MNMI/12');
  assert.equal(startup.error, STORAGE_BLOCKED_MESSAGE);
});

test('unavailable storage says nothing until an area needs saving', () => {
  assert.equal(startSavedAreas(null, null, true).error, null);
  assert.equal(startSavedAreas(null, LINK, true).error, STORAGE_BLOCKED_MESSAGE);
  assert.equal(startSavedAreas(null, LINK, true).isSavedListRead, false);
});

function fakeWindow(href: string) {
  const url = new URL(href);
  const replacedUrls: string[] = [];
  const win = {
    location: { href, hash: url.hash, pathname: url.pathname, search: url.search },
    history: { state: null, replaceState: (_state: unknown, _title: string, next: string) => replacedUrls.push(next) },
  };
  return { win: win as unknown as Window, replacedUrls };
}

test('the opening link is taken and its area data removed from the address', () => {
  const href = `${SCOUT_URL}?from=mail#${areaPayload()}`;
  const { win, replacedUrls } = fakeWindow(href);
  assert.equal(takeAreaLinkFromAddress(win), href);
  assert.deepEqual(replacedUrls, ['/cbc/scout/?from=mail']);
});

test('an address with no area data is left alone', () => {
  for (const href of [SCOUT_URL, `${SCOUT_URL}#`]) {
    const { win, replacedUrls } = fakeWindow(href);
    assert.equal(takeAreaLinkFromAddress(win), null);
    assert.deepEqual(replacedUrls, []);
  }
});
