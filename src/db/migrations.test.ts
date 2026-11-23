import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MigrationFileNameError, MigrationSequenceError } from './errors.ts';
import { parseMigrationFiles } from './migrations.ts';

test('orders migrations by version and reads the name from the file', () => {
  const migrations = parseMigrationFiles({
    'db/migrations/002_add_notes.sql': 'two',
    'db/migrations/001_initial_schema.sql': 'one',
  });
  assert.deepEqual(migrations, [
    { version: 1, name: 'initial_schema', sql: 'one' },
    { version: 2, name: 'add_notes', sql: 'two' },
  ]);
});

test('a gap in versions reports which version was expected', () => {
  assert.throws(
    () => parseMigrationFiles({ '001_a.sql': '', '003_c.sql': '' }),
    (err) =>
      err instanceof MigrationSequenceError && err.expectedVersion === 2 && err.foundVersion === 3
  );
});

test('versions must start at 1', () => {
  assert.throws(
    () => parseMigrationFiles({ '002_a.sql': '' }),
    (err) =>
      err instanceof MigrationSequenceError && err.expectedVersion === 1 && err.foundVersion === 2
  );
});

test('a file without a version prefix is rejected with its path', () => {
  assert.throws(
    () => parseMigrationFiles({ 'db/migrations/notes.sql': '' }),
    (err) => err instanceof MigrationFileNameError && err.path === 'db/migrations/notes.sql'
  );
});
