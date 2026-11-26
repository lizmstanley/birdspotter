import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaDisplayName, areaLabel, escapeHtml, isOuterCircleBoundary } from './mapText.ts';

test('escapes every character that could open markup', () => {
  assert.equal(
    escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`),
    '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;'
  );
});

test('a numeric area code reads as "Area N"; a named one stays as is', () => {
  assert.equal(areaDisplayName('12'), 'Area 12');
  assert.equal(areaDisplayName('12B'), 'Area 12B');
  assert.equal(areaDisplayName('Lake Shore'), 'Lake Shore');
});

test('a missing area shows a dash', () => {
  assert.equal(areaLabel(null), '—');
  assert.equal(areaLabel('4'), 'Area 4');
});

test('the full circle outline is not an area, a numbered area is', () => {
  assert.equal(isOuterCircleBoundary('Full CBC circle'), true);
  assert.equal(isOuterCircleBoundary('3', '3 - West'), false);
});
