import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const REPO = join(import.meta.dirname, '..');
const PHONE_APP_PUBLIC_FOLDERS = ['apps/birdspotter/public', 'apps/cbc-scout/public'];

// Chrome's limits for manifest screenshots; one it rejects can cost the larger install sheet.
const MIN_SIDE_PX = 320;
const MAX_SIDE_PX = 3840;
const MAX_LONG_TO_SHORT = 2.3;
const MAX_SHOWN_ON_ANDROID = 5;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// PNG color types 0 (gray) and 2 (RGB) have no alpha channel.
const OPAQUE_COLOR_TYPES = new Set([0, 2]);

interface ManifestScreenshot {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly form_factor?: string;
  readonly label?: string;
}

interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly colorType: number;
  readonly hasTransparencyChunk: boolean;
}

function readPngHeader(path: string): PngHeader {
  const bytes = readFileSync(path);
  assert.ok(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
    // The PNG format puts tRNS before the image data, where any four compressed bytes could spell it.
    hasTransparencyChunk: bytes.subarray(0, bytes.indexOf('IDAT')).includes('tRNS'),
  };
}

function readScreenshots(folder: string): readonly ManifestScreenshot[] {
  const manifest = JSON.parse(readFileSync(join(REPO, folder, 'manifest.webmanifest'), 'utf8')) as {
    screenshots?: ManifestScreenshot[];
  };
  return manifest.screenshots ?? [];
}

for (const folder of PHONE_APP_PUBLIC_FOLDERS) {
  test(`${folder} lists phone screenshots Chrome will show in its install sheet`, () => {
    const screenshots = readScreenshots(folder);

    assert.ok(screenshots.length >= 1, 'with no narrow screenshot, Chrome shows only the name and icon');
    assert.ok(screenshots.length <= MAX_SHOWN_ON_ANDROID);
    const ratios = new Set<string>();
    for (const screenshot of screenshots) {
      const png = readPngHeader(join(REPO, folder, screenshot.src));
      const long = Math.max(png.width, png.height);
      const short = Math.min(png.width, png.height);

      assert.equal(screenshot.sizes, `${png.width}x${png.height}`, `${screenshot.src} sizes`);
      assert.equal(screenshot.type, 'image/png');
      assert.equal(screenshot.form_factor, 'narrow');
      assert.ok(screenshot.label?.trim(), `${screenshot.src} needs a label`);
      assert.ok(short >= MIN_SIDE_PX && long <= MAX_SIDE_PX, `${screenshot.src} side out of range`);
      assert.ok(long / short <= MAX_LONG_TO_SHORT, `${screenshot.src} is too long for its width`);
      assert.ok(OPAQUE_COLOR_TYPES.has(png.colorType) && !png.hasTransparencyChunk, `${screenshot.src} has alpha`);
      ratios.add((png.width / png.height).toFixed(4));
    }
    assert.equal(ratios.size, 1, 'Chrome needs every screenshot of one form factor at the same aspect ratio');
  });
}
