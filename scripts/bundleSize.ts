import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Sizes are gzip bytes of the JS and CSS an app's entry page loads, which is what a phone downloads on update.
export const APPS = {
  'cbc-manager': 'cbc/manager/',
  'cbc-scout': 'cbc/scout/',
  birdspotter: 'app/',
} as const;
export type AppName = keyof typeof APPS;
export const APP_NAMES = Object.keys(APPS) as AppName[];

export interface AppSize {
  readonly js: number;
  readonly css: number;
}
export type SizeReport = Readonly<Record<AppName, AppSize>>;
// Main's report has no entry for an app a PR adds.
export type Baseline = Readonly<Partial<Record<AppName, AppSize>>>;
export type Budgets = Readonly<Record<AppName, number>>;

export interface OverBudget {
  readonly app: AppName;
  readonly size: number;
  readonly budget: number;
}

export class BundleSizeFileError extends Error {
  readonly file: string;
  constructor(file: string, problem: string) {
    super(`bundle-size: ${file} ${problem}`);
    this.name = 'BundleSizeFileError';
    this.file = file;
  }
}

const BYTES_PER_KB = 1000;

export function totalSize(size: AppSize): number {
  return size.js + size.css;
}

// The same set the phone apps' service workers save: every src or href under the app's assets/ folder.
// Matching on `/<app path>assets/` holds under any site base, such as /birdspotter/ on Pages.
// Returns paths relative to the app's folder, such as `assets/index-abc.js`.
export function entryAssetPaths(html: string, appPath: string): string[] {
  const assetsDir = `/${appPath}assets/`;
  const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].flatMap(([, value]) => {
    const start = value.indexOf(assetsDir);
    if (start === -1 || !/\.(?:js|css)$/.test(value)) return [];
    return [value.slice(start + 1 + appPath.length)];
  });
  return [...new Set(paths)];
}

export function measureApp(distDir: string, app: AppName): AppSize {
  const appDir = join(distDir, APPS[app]);
  const entryPage = join(appDir, 'index.html');
  const paths = entryAssetPaths(readFileSync(entryPage, 'utf8'), APPS[app]);
  if (!paths.some((path) => path.endsWith('.js'))) throw new BundleSizeFileError(entryPage, 'loads no script from assets/');
  const gzipBytes = (path: string): number => gzipSync(readFileSync(join(appDir, path))).length;
  const sum = (kind: string): number =>
    paths.filter((path) => path.endsWith(kind)).reduce((bytes, path) => bytes + gzipBytes(path), 0);
  return { js: sum('.js'), css: sum('.css') };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseBudgets(json: unknown, file: string): Budgets {
  if (!isRecord(json) || !isRecord(json.budgetsKb)) throw new BundleSizeFileError(file, 'has no budgetsKb object');
  const budgetsKb = json.budgetsKb;
  const entries = APP_NAMES.map((app) => {
    const kb = budgetsKb[app];
    if (!isByteCount(kb) || kb === 0) throw new BundleSizeFileError(file, `has no positive whole budget for ${app}`);
    return [app, kb * BYTES_PER_KB] as const;
  });
  return Object.fromEntries(entries) as Record<AppName, number>;
}

export function parseBaseline(json: unknown, file: string): Baseline {
  if (!isRecord(json)) throw new BundleSizeFileError(file, 'is not a size report');
  const entries = APP_NAMES.flatMap((app) => {
    const size = json[app];
    if (size === undefined) return [];
    if (!isRecord(size) || !isByteCount(size.js) || !isByteCount(size.css)) {
      throw new BundleSizeFileError(file, `has no js and css sizes for ${app}`);
    }
    return [[app, { js: size.js, css: size.css }] as const];
  });
  return Object.fromEntries(entries);
}

export function overBudget(report: SizeReport, budgets: Budgets): OverBudget[] {
  return APP_NAMES.map((app) => ({ app, size: totalSize(report[app]), budget: budgets[app] })).filter(
    ({ size, budget }) => size > budget,
  );
}

export function formatKb(bytes: number): string {
  return `${(bytes / BYTES_PER_KB).toFixed(1)} kB`;
}

function formatChange(bytes: number): string {
  return `${bytes > 0 ? '+' : ''}${formatKb(bytes)}`;
}

// The change column is left out when there is no baseline from main.
export function summaryTable(report: SizeReport, budgets: Budgets, baseline: Baseline | undefined): string {
  const header = baseline
    ? ['| App | Size (gzip) | Budget | Change from main |', '| --- | ---: | ---: | ---: |']
    : ['| App | Size (gzip) | Budget |', '| --- | ---: | ---: |'];
  const rows = APP_NAMES.map((app) => {
    const size = totalSize(report[app]);
    const cells = [app, formatKb(size), formatKb(budgets[app])];
    const mainSize = baseline?.[app];
    if (baseline) cells.push(mainSize ? formatChange(size - totalSize(mainSize)) : 'new');
    return `| ${cells.join(' | ')} |`;
  });
  return [...header, ...rows].join('\n');
}
