import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SetStateAction } from 'react';
import type { GeolocateControl } from 'maplibre-gl';
import { LOCATION_UNAVAILABLE_MESSAGE } from './locationHelp.ts';
import { followLocationControl, NOT_TRACKING, TRACKING_STORAGE_KEY, type LiveLocation } from './locationTracking.ts';
import { MemoryStorage } from './testing/areaFixtures.ts';
import { FakeLocationControl } from './testing/fakeLocationControl.ts';

interface FakeDocument {
  visibilityState: DocumentVisibilityState;
  listener: (() => void) | null;
}

const fakeDocument: FakeDocument = { visibilityState: 'visible', listener: null };

beforeEach(() => {
  fakeDocument.visibilityState = 'visible';
  fakeDocument.listener = null;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get visibilityState() {
        return fakeDocument.visibilityState;
      },
      addEventListener: (_type: string, listener: () => void) => (fakeDocument.listener = listener),
      removeEventListener: () => (fakeDocument.listener = null),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis.navigator, 'permissions');
});

function follow(control: FakeLocationControl, storage: MemoryStorage | null = new MemoryStorage()) {
  let live = NOT_TRACKING;
  const setLive = (update: SetStateAction<LiveLocation>) => {
    live = typeof update === 'function' ? update(live) : update;
  };
  const stop = followLocationControl(control as unknown as GeolocateControl, storage, setLive);
  return { current: () => live, stop };
}

function showPage(): void {
  fakeDocument.visibilityState = 'visible';
  fakeDocument.listener?.();
}

test('saves tracking as on when the person starts it, and reports each fix', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  const tracked = follow(control, storage);
  control.trigger();
  control.locate(-93.25, 44.95);
  assert.equal(storage.getItem(TRACKING_STORAGE_KEY), 'on');
  assert.deepEqual(tracked.current(), { position: [-93.25, 44.95], isTracking: true, error: null });
});

test('restarts tracking on start when it was on last time', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  storage.setItem(TRACKING_STORAGE_KEY, 'on');
  const tracked = follow(control, storage);
  assert.equal(control._watchState, 'WAITING_ACTIVE');
  assert.equal(tracked.current().isTracking, true);
});

test('does not toggle a watch that is already running when following again', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  storage.setItem(TRACKING_STORAGE_KEY, 'on');
  follow(control, storage).stop();
  follow(control, storage);
  assert.equal(control.triggerCount, 1);
  assert.equal(control._watchState, 'WAITING_ACTIVE');
});

test('keeps tracking on and the last fix when the person pans away', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  const tracked = follow(control, storage);
  control.trigger();
  control.locate(-93.25, 44.95);
  control.panAway();
  assert.equal(storage.getItem(TRACKING_STORAGE_KEY), 'on');
  assert.deepEqual(tracked.current().position, [-93.25, 44.95]);
});

test('clears tracking and the fix when the person turns it off', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  const tracked = follow(control, storage);
  control.trigger();
  control.locate(-93.25, 44.95);
  control.trigger();
  assert.equal(storage.getItem(TRACKING_STORAGE_KEY), null);
  assert.deepEqual(tracked.current(), NOT_TRACKING);
});

test('shows how to allow location and stops restoring it when permission is denied', () => {
  const control = new FakeLocationControl();
  const storage = new MemoryStorage();
  const tracked = follow(control, storage);
  control.trigger();
  control.fail(1);
  assert.equal(storage.getItem(TRACKING_STORAGE_KEY), null);
  assert.match(tracked.current().error ?? '', /not allowed to see your location/);
  showPage();
  assert.equal(control._watchState, 'OFF');
});

test('keeps the last fix and says it is still trying after a timeout', () => {
  const control = new FakeLocationControl();
  const tracked = follow(control);
  control.trigger();
  control.locate(-93.25, 44.95);
  control.fail(3);
  assert.equal(tracked.current().error, LOCATION_UNAVAILABLE_MESSAGE);
  assert.deepEqual(tracked.current().position, [-93.25, 44.95]);
});

test('starts a fresh watch when the page is shown again after an error', () => {
  const control = new FakeLocationControl();
  follow(control);
  control.trigger();
  control.fail(3);
  showPage();
  assert.equal(control._watchState, 'WAITING_ACTIVE');
  assert.equal(control.triggerCount, 3);
});

test('leaves a working watch alone when the page is shown again', () => {
  const control = new FakeLocationControl();
  follow(control);
  control.trigger();
  control.locate(-93.25, 44.95);
  control.panAway();
  showPage();
  assert.equal(control._watchState, 'BACKGROUND');
  assert.equal(control.triggerCount, 1);
});

test('does not start tracking on show when the person never turned it on', () => {
  const control = new FakeLocationControl();
  follow(control);
  showPage();
  assert.equal(control.triggerCount, 0);
});

test('shows how to allow location on start when permission was denied before', async () => {
  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'denied' }) },
  });
  const tracked = follow(new FakeLocationControl());
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(tracked.current().error ?? '', /not allowed to see your location/);
});

test('leaves the line clear on start when permission is granted or not yet asked', async () => {
  for (const state of ['granted', 'prompt']) {
    Object.defineProperty(globalThis.navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state }) },
    });
    const tracked = follow(new FakeLocationControl());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(tracked.current().error, null);
  }
});

test('ignores a denied permission answer that arrives after following stops', async () => {
  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'denied' }) },
  });
  const tracked = follow(new FakeLocationControl());
  tracked.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(tracked.current().error, null);
});

test('does not start tracking on show when the control was still setting up and the person never turned it on', () => {
  const control = new FakeLocationControl();
  control._watchState = undefined;
  follow(control);
  control._watchState = 'OFF';
  showPage();
  assert.equal(control.triggerCount, 0);
});
