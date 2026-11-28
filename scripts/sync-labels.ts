// Creates or updates every label in .github/labels.json with `gh`. Labels not in the file are left alone.
// Run with `npm run labels`, or `npm run labels -- <owner/repo>` for another repo.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface LabelDefinition {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

class LabelFileError extends Error {
  readonly entry: unknown;

  constructor(entry: unknown) {
    super('sync-labels: each label needs a name, a six-digit hex color, and a description');
    this.name = 'LabelFileError';
    this.entry = entry;
  }
}

function isLabelDefinition(entry: unknown): entry is LabelDefinition {
  if (typeof entry !== 'object' || entry === null) return false;
  const { name, color, description } = entry as Record<string, unknown>;
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    typeof color === 'string' &&
    /^[0-9a-f]{6}$/i.test(color) &&
    typeof description === 'string'
  );
}

function readLabels(): readonly LabelDefinition[] {
  const entries: unknown = JSON.parse(readFileSync(new URL('../.github/labels.json', import.meta.url), 'utf8'));
  if (!Array.isArray(entries)) throw new LabelFileError(entries);
  for (const entry of entries) {
    if (!isLabelDefinition(entry)) throw new LabelFileError(entry);
  }
  return entries as LabelDefinition[];
}

const repo = process.argv[2] ?? 'lizmstanley/birdspotter';
for (const { name, color, description } of readLabels()) {
  execFileSync(
    'gh',
    ['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force'],
    { stdio: 'inherit' },
  );
}
