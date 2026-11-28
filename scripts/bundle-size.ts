// Measures each app in dist/ after `npm run build` and fails when one is over its budget in bundle-size-budget.json.
// Run from the repo root: `node scripts/bundle-size.ts --report <out.json> [--baseline <main report.json>]`.
// A baseline path that does not exist leaves the change column out, as when main has no report yet.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  APP_NAMES,
  type AppName,
  type AppSize,
  formatKb,
  measureApp,
  overBudget,
  parseBaseline,
  parseBudgets,
  type SizeReport,
  summaryTable,
} from './bundleSize.ts';

const DIST = 'dist';
const BUDGET_FILE = 'scripts/bundle-size-budget.json';

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const { values } = parseArgs({ options: { report: { type: 'string' }, baseline: { type: 'string' } } });
if (values.report === undefined) {
  console.error('bundle-size: usage: node scripts/bundle-size.ts --report <file> [--baseline <file>]');
  process.exit(2);
}

const report: SizeReport = Object.fromEntries(APP_NAMES.map((app) => [app, measureApp(DIST, app)])) as Record<
  AppName,
  AppSize
>;
writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);

const budgets = parseBudgets(readJson(BUDGET_FILE), BUDGET_FILE);
const baselineFile = values.baseline;
const baseline =
  baselineFile !== undefined && existsSync(baselineFile) ? parseBaseline(readJson(baselineFile), baselineFile) : undefined;

const summary = `## Bundle size\n\n${summaryTable(report, budgets, baseline)}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

const over = overBudget(report, budgets);
for (const { app, size, budget } of over) {
  console.error(
    `bundle-size: ${app} is ${formatKb(size)}, ${formatKb(size - budget)} over its ${formatKb(budget)} budget in ${BUDGET_FILE}`,
  );
}
if (over.length > 0) process.exit(1);
