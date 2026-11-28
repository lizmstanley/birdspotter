import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { contrastRatio, hasMapDarkFilter, readDarkRules, readPalettes, resolveColor } from './testing/colorScheme.ts';

const BIRDING_CSS = join(import.meta.dirname, 'birding.css');
const AA_TEXT = 4.5;

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--birding-text', '--birding-bg'],
  ['--birding-text', '--birding-surface'],
  ['--birding-text', '--birding-tab-bg'],
  ['--birding-muted', '--birding-bg'],
  ['--birding-muted', '--birding-surface'],
  ['--birding-accent', '--birding-bg'],
  ['--birding-accent', '--birding-surface'],
  ['--birding-error-text', '--birding-bg'],
  ['--birding-error-text', '--birding-error-bg'],
  ['--birding-success-text', '--birding-success-bg'],
  ['--birding-notable-text', '--birding-notable-bg'],
  ['--birding-text', '--birding-notable-row-bg'],
  ['--birding-muted', '--birding-notable-row-bg'],
  ['--birding-accent', '--birding-notable-row-bg'],
  ['--birding-text', '--birding-confirmed-row-bg'],
  ['--birding-muted', '--birding-confirmed-row-bg'],
  ['--birding-confirmed-accent', '--birding-confirmed-row-bg'],
  ['#ffffff', '#b45309'],
];

for (const [look, palette] of Object.entries(readPalettes(BIRDING_CSS))) {
  test(`birding.css text meets WCAG AA in the ${look} look`, () => {
    for (const [text, background] of TEXT_PAIRS) {
      const ratio = contrastRatio(resolveColor(palette, text), resolveColor(palette, background));
      assert.ok(ratio >= AA_TEXT, `${text} on ${background}: ${ratio.toFixed(2)}`);
    }
  });
}

test('only the dark look filters the map canvas, with the filter the contrast checks model', () => {
  assert.ok(hasMapDarkFilter(readDarkRules(BIRDING_CSS), '.birding-map .maplibregl-canvas'));
  assert.equal(readFileSync(BIRDING_CSS, 'utf8').split('maplibregl-canvas {').length, 2);
});
