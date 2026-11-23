import type { PGlite } from '@electric-sql/pglite';
import {
  LegacyMigrationError,
  MigrationFileNameError,
  MigrationSequenceError,
  SchemaTooNewError,
} from './errors.ts';
import { moveLegacyRoster, setAsideLegacySchema } from './legacySingleCircle.ts';
import type { Queryable } from './queryable.ts';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const MIGRATION_FILE = /(?:^|\/)(\d+)_([^/]+)\.sql$/;
const BASELINE_VERSION = 1;

/** @param files migration SQL text keyed by file path, such as `db/migrations/001_initial_schema.sql` */
export function parseMigrationFiles(files: Readonly<Record<string, string>>): Migration[] {
  const migrations = Object.entries(files).map(([path, sql]) => {
    const match = MIGRATION_FILE.exec(path);
    if (!match) throw new MigrationFileNameError(path);
    return { version: Number(match[1]), name: match[2], sql };
  });
  migrations.sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationSequenceError(index + 1, migration.version);
    }
  });
  return migrations;
}

type DatabaseShape = 'versioned' | 'fresh' | 'unversioned' | 'legacy_single_circle';

async function tableExists(db: Queryable, table: string): Promise<boolean> {
  const res = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return Boolean(res.rows[0]?.exists);
}

async function columnExists(db: Queryable, table: string, column: string): Promise<boolean> {
  const res = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return Boolean(res.rows[0]?.exists);
}

async function detectShape(db: Queryable): Promise<DatabaseShape> {
  if (await tableExists(db, 'schema_version')) return 'versioned';
  if (!(await tableExists(db, 'people'))) return 'fresh';
  if (await columnExists(db, 'people', 'circle_code')) return 'unversioned';
  return 'legacy_single_circle';
}

async function createVersionTable(db: Queryable): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.schema_version (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function recordVersion(db: Queryable, migration: Migration): Promise<void> {
  await db.query('INSERT INTO public.schema_version (version, name) VALUES ($1, $2)', [
    migration.version,
    migration.name,
  ]);
}

async function readAppliedVersion(db: Queryable): Promise<number> {
  const res = await db.query<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM public.schema_version'
  );
  return res.rows[0]?.version ?? 0;
}

async function applyMigrations(
  db: Queryable,
  migrations: readonly Migration[],
  appliedVersion: number
): Promise<void> {
  const pending = migrations.filter((migration) => migration.version > appliedVersion);
  for (const migration of pending) {
    await db.exec(migration.sql);
    await recordVersion(db, migration);
  }
}

async function moveLegacyDatabase(
  db: PGlite,
  migrations: readonly Migration[],
  viewsSql: string
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await setAsideLegacySchema(tx);
      await createVersionTable(tx);
      await applyMigrations(tx, migrations, 0);
      await tx.exec(viewsSql);
      await moveLegacyRoster(tx);
    });
  } catch (err) {
    throw new LegacyMigrationError(err);
  }
}

/**
 * Brings the database to the latest migration and re-applies the views.
 * Each step runs in one transaction, so a failure leaves the database as it was.
 * @throws SchemaTooNewError when the database is ahead of `migrations`
 * @throws LegacyMigrationError when a single-circle database cannot be moved
 */
export async function migrate(
  db: PGlite,
  migrations: readonly Migration[],
  viewsSql: string
): Promise<void> {
  const shape = await detectShape(db);
  if (shape === 'legacy_single_circle') {
    await moveLegacyDatabase(db, migrations, viewsSql);
    return;
  }

  await db.transaction(async (tx) => {
    if (shape === 'fresh') {
      await tx.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }
    await createVersionTable(tx);
    if (shape === 'unversioned') {
      await recordVersion(tx, migrations[BASELINE_VERSION - 1]);
    }

    const appliedVersion = await readAppliedVersion(tx);
    const latestVersion = migrations.length;
    if (appliedVersion > latestVersion) throw new SchemaTooNewError(appliedVersion, latestVersion);

    await applyMigrations(tx, migrations, appliedVersion);
    await tx.exec(viewsSql);
  });
}
