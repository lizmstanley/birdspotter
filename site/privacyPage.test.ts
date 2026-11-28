import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const REPO = join(import.meta.dirname, '..');
const PHONE_APPS = ['apps/birdspotter', 'apps/cbc-scout'];
const SHARED_SOURCE = ['packages/birding-core/src'];
const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.html', '.webmanifest'];

function isScannedFile(name: string): boolean {
  return SCANNED_EXTENSIONS.some((extension) => name.endsWith(extension)) && !name.endsWith('.test.ts');
}

function runtimeFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return isScannedFile(path) ? [path] : [];
  return readdirSync(path)
    .filter((name) => name !== 'node_modules' && name !== 'testing')
    .flatMap((name) => runtimeFiles(join(path, name)));
}

// CBC Scout bundles the circle manager files that package's exports map lists.
function circleManagerSharedFiles(): string[] {
  const manifest = JSON.parse(readFileSync(join(REPO, 'apps/cbc-manager/package.json'), 'utf8')) as {
    exports: Record<string, string>;
  };
  return Object.values(manifest.exports).map((path) => join(REPO, 'apps/cbc-manager', path));
}

function hostsNamedIn(text: string): Set<string> {
  return new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(([, host]) => host.toLowerCase()));
}

function phoneAppHosts(): Set<string> {
  const files = [
    ...[...PHONE_APPS, ...SHARED_SOURCE].flatMap((folder) => runtimeFiles(join(REPO, folder))),
    ...circleManagerSharedFiles(),
  ];
  return new Set(files.flatMap((file) => [...hostsNamedIn(readFileSync(file, 'utf8'))]));
}

test("the privacy page names every outside host in the phone apps' code", () => {
  const page = readFileSync(join(REPO, 'site/privacy/index.html'), 'utf8');
  const hosts = phoneAppHosts();

  assert.ok(hosts.has('api.ebird.org'), 'the scan found no eBird API address, so it read no app code');
  const unnamed = [...hosts].filter((host) => !page.includes(`<code>${host}</code>`));
  assert.deepEqual(unnamed, [], 'add each host to site/privacy/index.html, saying what it receives and when');
});
