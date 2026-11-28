import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  BundleSizeFileError,
  entryAssetPaths,
  measureApp,
  overBudget,
  parseBaseline,
  parseBudgets,
  type SizeReport,
  summaryTable,
} from './bundleSize.ts';

const PAGES_ENTRY_PAGE = `
  <link rel="manifest" href="/birdspotter/cbc/scout/manifest.webmanifest" />
  <link rel="icon" type="image/png" href="/birdspotter/cbc/scout/assets/icon.png" />
  <script type="module" crossorigin src="/birdspotter/cbc/scout/assets/index-CWSz_--b.js"></script>
  <link rel="modulepreload" href="/birdspotter/cbc/scout/assets/index-CWSz_--b.js">
  <link rel="modulepreload" href="/birdspotter/cbc/manager/assets/shared-x1.js">
  <link rel="stylesheet" crossorigin href="/birdspotter/cbc/scout/assets/index-DjV4lgUv.css">
`;

const REPORT: SizeReport = {
  'cbc-manager': { js: 900_000, css: 14_000 },
  'cbc-scout': { js: 620_000, css: 12_000 },
  birdspotter: { js: 550_000, css: 12_000 },
};

const BUDGETS = parseBudgets({ budgetsKb: { 'cbc-manager': 914, 'cbc-scout': 631, birdspotter: 600 } }, 'budget.json');

test('entryAssetPaths keeps the JS and CSS under the app assets folder once each, under a site base', () => {
  assert.deepEqual(entryAssetPaths(PAGES_ENTRY_PAGE, 'cbc/scout/'), [
    'assets/index-CWSz_--b.js',
    'assets/index-DjV4lgUv.css',
  ]);
});

test('parseBudgets converts kB to bytes', () => {
  assert.equal(BUDGETS['cbc-scout'], 631_000);
});

test('parseBudgets rejects a budget file missing an app', () => {
  assert.throws(
    () => parseBudgets({ budgetsKb: { 'cbc-manager': 1, 'cbc-scout': 1 } }, 'budget.json'),
    (error) => error instanceof BundleSizeFileError && error.message.includes('birdspotter'),
  );
});

test('measureApp sums the gzip size of the entry JS and CSS by kind', () => {
  const dist = mkdtempSync(join(tmpdir(), 'bundle-size-'));
  try {
    const assets = join(dist, 'app', 'assets');
    mkdirSync(assets, { recursive: true });
    const js = 'console.log("birds");'.repeat(50);
    const css = 'body { color: green; }'.repeat(50);
    writeFileSync(join(assets, 'index-a.js'), js);
    writeFileSync(join(assets, 'index-b.css'), css);
    writeFileSync(join(assets, 'unloaded-c.js'), 'x'.repeat(5000));
    writeFileSync(
      join(dist, 'app', 'index.html'),
      '<script src="/app/assets/index-a.js"></script><link rel="stylesheet" href="/app/assets/index-b.css">',
    );
    assert.deepEqual(measureApp(dist, 'birdspotter'), { js: gzipSync(js).length, css: gzipSync(css).length });
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('parseBaseline rejects an app size that is not a whole byte count', () => {
  const report = { ...REPORT, birdspotter: { js: '550000', css: 12_000 } };
  assert.throws(() => parseBaseline(report, 'main.json'), BundleSizeFileError);
});

test('summaryTable marks an app missing from main as new', () => {
  const baseline = parseBaseline({ 'cbc-manager': REPORT['cbc-manager'], 'cbc-scout': REPORT['cbc-scout'] }, 'main.json');
  assert.equal(summaryTable(REPORT, BUDGETS, baseline).split('\n')[4], '| birdspotter | 562.0 kB | 600.0 kB | new |');
});

test('overBudget lists only apps over their budget, so a size equal to it passes', () => {
  assert.deepEqual(overBudget(REPORT, BUDGETS), [{ app: 'cbc-scout', size: 632_000, budget: 631_000 }]);
});

test('summaryTable shows the change from main when a baseline exists', () => {
  const baseline: SizeReport = { ...REPORT, birdspotter: { js: 551_500, css: 12_000 } };
  const lines = summaryTable(REPORT, BUDGETS, baseline).split('\n');
  assert.equal(lines[0], '| App | Size (gzip) | Budget | Change from main |');
  assert.equal(lines[2], '| cbc-manager | 914.0 kB | 914.0 kB | 0.0 kB |');
  assert.equal(lines[4], '| birdspotter | 562.0 kB | 600.0 kB | -1.5 kB |');
});

test('summaryTable leaves out the change column with no baseline', () => {
  const lines = summaryTable(REPORT, BUDGETS, undefined).split('\n');
  assert.equal(lines[0], '| App | Size (gzip) | Budget |');
  assert.equal(lines[3], '| cbc-scout | 632.0 kB | 631.0 kB |');
});

test('the checked-in budget file has a budget for every app', () => {
  const file = join(import.meta.dirname, 'bundle-size-budget.json');
  assert.doesNotThrow(() => parseBudgets(JSON.parse(readFileSync(file, 'utf8')), file));
});
