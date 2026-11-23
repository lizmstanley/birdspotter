import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaFeatures, describeHoveredArea, excludeNotCounted } from './areaFeatures.ts';
import type { AreaBoundaryItem } from './types.ts';

const square: AreaBoundaryItem['boundary_geojson'] = {
  type: 'Polygon',
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

const BOUNDARIES: AreaBoundaryItem[] = [
  { code: 'Full CBC circle', label: 'Full CBC circle', boundary_geojson: square },
  { code: '1', label: '1 - West', boundary_geojson: square },
  { code: '2b', label: null, boundary_geojson: square },
];

test('not-counted codes match ignoring case and drop out of the outlines', () => {
  const kept = excludeNotCounted(BOUNDARIES, ['2B']);
  assert.deepEqual(kept.map((b) => b.code), ['Full CBC circle', '1']);
});

test('the outer circle gets no fill and a thicker line', () => {
  const [outer, counted] = buildAreaFeatures(BOUNDARIES, []);
  assert.equal(outer.properties.isOuter, true);
  assert.equal(outer.properties.fillOpacity, 0);
  assert.equal(outer.properties.lineWidth, 3.5);
  assert.equal(counted.properties.isOuter, false);
  assert.equal(counted.properties.lineWidth, 2.5);
});

test('a not-counted area is gray', () => {
  const features = buildAreaFeatures(BOUNDARIES, ['2B']);
  assert.equal(features[2].properties.fillColor, '#64748b');
  assert.equal(features[1].properties.fillColor === '#64748b', false);
});

test('feature ids start at 1 so hover state has a truthy id', () => {
  assert.deepEqual(buildAreaFeatures(BOUNDARIES, []).map((f) => f.id), [1, 2, 3]);
});

test('hover text counts participants and handles one as singular', () => {
  assert.deepEqual(describeHoveredArea('5', 1, false), {
    displayName: 'Area 5',
    tooltipCount: '1 participant assigned',
    pill: 'Area 5 · 1 assigned',
  });
  assert.equal(describeHoveredArea('5', 3, false).tooltipCount, '3 participants assigned');
});

test('hover text for a not-counted area says so instead of a count', () => {
  assert.deepEqual(describeHoveredArea('5', 9, true), {
    displayName: 'Area 5',
    tooltipCount: 'Not counted in this circle',
    pill: 'Area 5 · Not Counted',
  });
});
