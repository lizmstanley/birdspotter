import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GeolocateControl } from 'maplibre-gl';
import type { LocationFix } from './countSession.ts';
import { recordFromLocationControl } from './sessionRecording.ts';
import { FakeLocationControl } from './testing/fakeLocationControl.ts';

const page: { visibilityState: DocumentVisibilityState; listener: (() => void) | null } = {
  visibilityState: 'visible',
  listener: null,
};

beforeEach(() => {
  page.visibilityState = 'visible';
  page.listener = null;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get visibilityState() {
        return page.visibilityState;
      },
      addEventListener: (_type: string, listener: () => void) => (page.listener = listener),
      removeEventListener: () => (page.listener = null),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
});

function record(control: FakeLocationControl) {
  const fixes: LocationFix[] = [];
  let breakCount = 0;
  const stop = recordFromLocationControl(
    control as unknown as GeolocateControl,
    (fix) => fixes.push(fix),
    () => (breakCount += 1)
  );
  return { fixes, breaks: () => breakCount, stop };
}

test('turns on tracking and reports each fix with its time and accuracy', () => {
  const control = new FakeLocationControl();
  const recording = record(control);
  control.locate(-93.25, 44.95, 1_000, 12);
  assert.equal(control._watchState, 'ACTIVE_LOCK');
  assert.deepEqual(recording.fixes, [{ lng: -93.25, lat: 44.95, time: 1_000, accuracy: 12 }]);
});

test('reports a break when the page is hidden, and not when it is shown', () => {
  const recording = record(new FakeLocationControl());
  page.visibilityState = 'hidden';
  page.listener?.();
  page.visibilityState = 'visible';
  page.listener?.();
  assert.equal(recording.breaks(), 1);
});

test('reports a break when the watch stops or fails, and not when the person pans away', () => {
  const control = new FakeLocationControl();
  const recording = record(control);
  control.panAway();
  assert.equal(recording.breaks(), 0);
  control.fail(3);
  control.trigger();
  assert.equal(recording.breaks(), 2);
});

test('reports nothing after it stops', () => {
  const control = new FakeLocationControl();
  const recording = record(control);
  recording.stop();
  control.locate(-93.25, 44.95, 1_000);
  control.fail(3);
  assert.equal(recording.fixes.length, 0);
  assert.equal(recording.breaks(), 0);
  assert.equal(page.listener, null);
});
