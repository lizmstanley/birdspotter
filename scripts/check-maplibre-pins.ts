// Fails when the workspaces name different maplibre-gl versions. Two versions build two copies of MapLibre.
// Run from the repo root: `node scripts/check-maplibre-pins.ts`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = 'maplibre-gl';
const WORKSPACE_DIRS = ['apps', 'packages'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

type Manifest = Partial<Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>>;

function workspaceManifests(): string[] {
  return WORKSPACE_DIRS.flatMap((dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name, 'package.json')),
  );
}

function maplibrePins(manifestPath: string): { where: string; version: string }[] {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const version = manifest[field]?.[PACKAGE];
    return version === undefined ? [] : [{ where: `${manifestPath} ${field}`, version }];
  });
}

const pins = workspaceManifests().flatMap(maplibrePins);
const versions = new Set(pins.map((pin) => pin.version));

if (pins.length === 0) {
  console.error(`check-maplibre-pins: no workspace names ${PACKAGE}`);
  process.exit(1);
}
if (versions.size > 1) {
  console.error(`check-maplibre-pins: ${PACKAGE} versions differ:`);
  for (const pin of pins) console.error(`  ${pin.where}: ${pin.version}`);
  process.exit(1);
}
console.log(`check-maplibre-pins: ${pins.length} pins at ${PACKAGE} ${[...versions][0]}`);
