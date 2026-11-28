import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  contrastRatio,
  darkMapContrast,
  hasMapDarkFilter,
  mergePalettes,
  readDarkRules,
  readPalettes,
  resolveColor,
} from '@birdspotter/birding-core/testing/colorScheme.ts';
import { MODE_COLORS } from './routeLayers.ts';

const CORE_CSS = fileURLToPath(import.meta.resolve('@birdspotter/birding-core/birding.css'));
const SCOUT_CSS = join(import.meta.dirname, 'scout.css');
const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;
// The background of OpenFreeMap's liberty style, which the route lines draw over.
const BASEMAP_BACKGROUND = '#f8f4f0';

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['#ffffff', '--birding-bar-color'],
  ['--scout-info-text', '--scout-info-bg'],
  ['--scout-notice-text', '--scout-notice-bg'],
];

const core = readPalettes(CORE_CSS);
const scout = readPalettes(SCOUT_CSS);

for (const look of ['light', 'dark'] as const) {
  const palette = mergePalettes(core[look], scout[look]);

  test(`CBC Scout text meets WCAG AA in the ${look} look`, () => {
    for (const [text, background] of TEXT_PAIRS) {
      const ratio = contrastRatio(resolveColor(palette, text), resolveColor(palette, background));
      assert.ok(ratio >= AA_TEXT, `${text} on ${background}: ${ratio.toFixed(2)}`);
    }
  });

  test(`CBC Scout's invalid field outline stands out in the ${look} look`, () => {
    const ratio = contrastRatio(resolveColor(palette, '--scout-invalid'), resolveColor(palette, '--birding-bg'));
    assert.ok(ratio >= AA_GRAPHIC, ratio.toFixed(2));
  });
}

test('route lines stand out on the street map in both looks', () => {
  for (const color of Object.values(MODE_COLORS)) {
    assert.ok(contrastRatio(color, BASEMAP_BACKGROUND) >= AA_GRAPHIC, `light ${color}`);
    assert.ok(darkMapContrast(color, BASEMAP_BACKGROUND) >= AA_GRAPHIC, `dark ${color}`);
  }
});

test('the route swatch takes the map filter in the dark look, so it matches its line', () => {
  assert.ok(hasMapDarkFilter(readDarkRules(SCOUT_CSS), '.scout-swatch'));
});
