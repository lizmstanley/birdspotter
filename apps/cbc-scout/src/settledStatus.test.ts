import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GeolocateControl } from 'maplibre-gl';
import { FakeLocationControl } from '@birdspotter/birding-core/testing/fakeLocationControl.ts';
import { countCircle } from './areaRegion.ts';
import type { AreaStatus } from './areaStatus.ts';
import {
  followSettledStatus,
  nextSettledState,
  UNSETTLED,
  type Crossing,
  type SettledState,
  type StatusFix,
} from './settledStatus.ts';
import { areaData } from './testing/areaFixtures.ts';

const IN_AREA: AreaStatus = { kind: 'in-area', areaName: 'Area 12' };
const OUTSIDE_AREA: AreaStatus = { kind: 'outside-area' };
const OUTSIDE_CIRCLE: AreaStatus = { kind: 'outside-circle' };

function fix(status: AreaStatus, time: number, overrides: Partial<StatusFix> = {}): StatusFix {
  return { status, edgeMeters: 500, accuracy: 10, time, ...overrides };
}

function run(fixes: readonly StatusFix[], start: SettledState = UNSETTLED) {
  let state = start;
  const crossings: Crossing[] = [];
  for (const each of fixes) {
    const next = nextSettledState(state, each);
    state = next.state;
    if (next.crossing) crossings.push(next.crossing);
  }
  return { settled: state.settled, crossings };
}

test('settles on the first good fix with no crossing', () => {
  assert.deepEqual(run([fix(IN_AREA, 1)]), { settled: IN_AREA, crossings: [] });
});

test('does not settle on a fix worse than 50 m', () => {
  assert.deepEqual(run([fix(IN_AREA, 1, { accuracy: 80 })]), { settled: null, crossings: [] });
});

test('crosses outward after two fixes in a row clear of the edge', () => {
  const result = run([fix(IN_AREA, 1), fix(OUTSIDE_AREA, 2)]);
  assert.deepEqual(result.crossings, []);
  assert.deepEqual(run([fix(IN_AREA, 1), fix(OUTSIDE_AREA, 2), fix(OUTSIDE_AREA, 3)]), {
    settled: OUTSIDE_AREA,
    crossings: ['outward'],
  });
});

test('crosses inward coming back into the area', () => {
  const fixes = [fix(OUTSIDE_AREA, 1), fix(IN_AREA, 2), fix(IN_AREA, 3)];
  assert.deepEqual(run(fixes).crossings, ['inward']);
});

test('crosses outward from outside the area to outside the circle, and inward from outside the circle', () => {
  const out = run([fix(OUTSIDE_AREA, 1), fix(OUTSIDE_CIRCLE, 2), fix(OUTSIDE_CIRCLE, 3)]);
  const back = run([fix(OUTSIDE_CIRCLE, 1), fix(OUTSIDE_AREA, 2), fix(OUTSIDE_AREA, 3)]);
  assert.deepEqual([out.crossings, back.crossings], [['outward'], ['inward']]);
});

test('ignores wobble across the edge while standing on it', () => {
  const fixes = Array.from({ length: 20 }, (_, index) =>
    fix(index % 3 === 0 ? IN_AREA : OUTSIDE_AREA, index + 1, { edgeMeters: 8 })
  );
  assert.deepEqual(run([fix(IN_AREA, 0), ...fixes]), { settled: IN_AREA, crossings: [] });
});

test('needs a margin of the fix accuracy when it is larger than 20 m', () => {
  const fixes = [fix(IN_AREA, 1), ...[2, 3, 4].map((time) => fix(OUTSIDE_AREA, time, { edgeMeters: 30, accuracy: 40 }))];
  assert.deepEqual(run(fixes).crossings, []);
});

test('needs a margin of at least 20 m when the fix is more accurate than that', () => {
  const fixes = [fix(IN_AREA, 1), ...[2, 3, 4].map((time) => fix(OUTSIDE_AREA, time, { edgeMeters: 15, accuracy: 5 }))];
  assert.deepEqual(run(fixes).crossings, []);
});

test('starts the hold over when a fix falls back within the margin', () => {
  const fixes = [
    fix(IN_AREA, 1),
    fix(OUTSIDE_AREA, 2),
    fix(OUTSIDE_AREA, 3, { edgeMeters: 5 }),
    fix(OUTSIDE_AREA, 4),
  ];
  assert.deepEqual(run(fixes).crossings, []);
});

test('starts the hold over when a fix lands back on the settled side', () => {
  const fixes = [fix(IN_AREA, 1), fix(OUTSIDE_AREA, 2), fix(IN_AREA, 3), fix(OUTSIDE_AREA, 4)];
  assert.deepEqual(run(fixes).crossings, []);
});

test('does not count a repeated fix with the same time twice', () => {
  const fixes = [fix(IN_AREA, 1), fix(OUTSIDE_AREA, 2), fix(OUTSIDE_AREA, 2)];
  assert.deepEqual(run(fixes).crossings, []);
});

test('starts the hold over after a rough fix', () => {
  const fixes = [fix(IN_AREA, 1), fix(OUTSIDE_AREA, 2), fix(OUTSIDE_AREA, 3, { accuracy: 90 }), fix(OUTSIDE_AREA, 4)];
  assert.deepEqual(run(fixes).crossings, []);
});

test('follows the location watch, settling on the first fix and cueing a later crossing', () => {
  const area = areaData();
  const control = new FakeLocationControl();
  const settled: AreaStatus[] = [];
  const crossings: Crossing[] = [];
  const stop = followSettledStatus(
    control as unknown as GeolocateControl,
    area,
    countCircle(area),
    (status) => settled.push(status),
    (crossing) => crossings.push(crossing)
  );
  control.locate(-93.25, 44.95, 1);
  control.locate(-93.25, 44.95, 2);
  control.locate(-93.25, 45.03, 3);
  control.locate(-93.25, 45.03, 4);
  stop();
  control.locate(-93.25, 44.95, 5);
  control.locate(-93.25, 44.95, 6);
  assert.deepEqual(settled, [IN_AREA, OUTSIDE_AREA]);
  assert.deepEqual(crossings, ['outward']);
});
