import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contrastRatio, mergePalettes, readPalettes, resolveColor } from '@birdspotter/birding-core/testing/colorScheme.ts';

const CORE_CSS = fileURLToPath(import.meta.resolve('@birdspotter/birding-core/birding.css'));
const BIRDSPOTTER_CSS = join(import.meta.dirname, 'birdspotter.css');
const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

const core = readPalettes(CORE_CSS);
const birdspotter = readPalettes(BIRDSPOTTER_CSS);

for (const look of ['light', 'dark'] as const) {
  const palette = mergePalettes(core[look], birdspotter[look]);
  const ratio = (foreground: string, background: string) =>
    contrastRatio(resolveColor(palette, foreground), resolveColor(palette, background));

  test(`Birdspotter text meets WCAG AA in the ${look} look`, () => {
    assert.ok(ratio('#ffffff', '--birding-bar-color') >= AA_TEXT);
    assert.ok(ratio('--birdspotter-place-text', '--birdspotter-place-bg') >= AA_TEXT);
  });

  test(`Birdspotter's chosen tab mark stands out in the ${look} look`, () => {
    assert.ok(ratio('--birdspotter-tab-mark', '--birding-bg') >= AA_GRAPHIC);
  });
}
