import { readFileSync } from 'node:fs';

export type Look = 'light' | 'dark';
export type Palette = Readonly<Record<string, string>>;

const DARK_MEDIA = '@media (prefers-color-scheme: dark)';
const HEX = /^#[0-9a-f]{6}$/i;

class ColorSchemeParseError extends Error {
  readonly file: string;

  constructor(file: string, problem: string) {
    super(`colorScheme: ${file}: ${problem}`);
    this.name = 'ColorSchemeParseError';
    this.file = file;
  }
}

class UnknownColorError extends Error {
  readonly color: string;

  constructor(color: string, value: string | undefined) {
    super(`colorScheme: ${color} is not a 6-digit hex color: ${value}`);
    this.name = 'UnknownColorError';
    this.color = color;
  }
}

function blockAfter(text: string, start: number, file: string): { body: string; end: number } {
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') depth -= 1;
    if (depth === 0) return { body: text.slice(open + 1, index), end: index + 1 };
  }
  throw new ColorSchemeParseError(file, 'unclosed block');
}

function rootVariables(text: string, file: string): Record<string, string> {
  const start = text.search(/:root\s*\{/);
  if (start < 0) throw new ColorSchemeParseError(file, 'no :root block');
  const { body } = blockAfter(text, start, file);
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

function splitLooks(file: string): { lightText: string; darkText: string } {
  const text = readFileSync(file, 'utf8');
  const mediaStart = text.indexOf(DARK_MEDIA);
  if (mediaStart < 0) throw new ColorSchemeParseError(file, `no ${DARK_MEDIA} block`);
  const media = blockAfter(text, mediaStart, file);
  return { lightText: text.slice(0, mediaStart) + text.slice(media.end), darkText: media.body };
}

/** Reads the custom properties a CSS file sets on `:root` in each look. Dark values override light ones. */
export function readPalettes(file: string): Readonly<Record<Look, Palette>> {
  const { lightText, darkText } = splitLooks(file);
  const light = rootVariables(lightText, file);
  return { light, dark: { ...light, ...rootVariables(darkText, file) } };
}

/** @returns the rules inside the file's dark `@media` block. */
export function readDarkRules(file: string): string {
  return splitLooks(file).darkText;
}

/** @returns whether the CSS gives the selector exactly `MAP_DARK_FILTER`. */
export function hasMapDarkFilter(css: string, selector: string): boolean {
  return css.includes(`${selector} {\n    filter: ${MAP_DARK_FILTER};\n  }`);
}

export function mergePalettes(...palettes: readonly Palette[]): Palette {
  return Object.assign({}, ...palettes) as Palette;
}

/** @returns the color itself when it is a hex literal, else the hex value of the named variable. */
export function resolveColor(palette: Palette, color: string): string {
  const value = color.startsWith('--') ? palette[color] : color;
  if (value === undefined || !HEX.test(value)) throw new UnknownColorError(color, value);
  return value;
}

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function rgbContrast(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2 contrast ratio of two hex colors. */
export function contrastRatio(first: string, second: string): number {
  return rgbContrast(toRgb(first), toRgb(second));
}

/** The CSS filter the dark look puts on the map canvas, as birding.css writes it. */
export const MAP_DARK_FILTER = 'invert(1) hue-rotate(180deg)';

// The matrices from the Filter Effects spec for invert(1) followed by hue-rotate(180deg).
function darkMapRgb([red, green, blue]: Rgb): Rgb {
  const inverted = [255 - red, 255 - green, 255 - blue];
  const rows = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856],
  ];
  const clamp = (value: number) => Math.min(255, Math.max(0, value));
  return rows.map((row) => clamp(row[0] * inverted[0] + row[1] * inverted[1] + row[2] * inverted[2])) as unknown as Rgb;
}

/** Contrast of two hex colors after both pass through `MAP_DARK_FILTER`. */
export function darkMapContrast(first: string, second: string): number {
  return rgbContrast(darkMapRgb(toRgb(first)), darkMapRgb(toRgb(second)));
}
