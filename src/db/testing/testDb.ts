import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { CbcDb } from '../cbcDb.ts';
import { parseMigrationFiles, type Migration } from '../migrations.ts';

const MIGRATIONS_DIR = new URL('../../../db/migrations/', import.meta.url);

export const migrations: Migration[] = parseMigrationFiles(
  Object.fromEntries(
    readdirSync(MIGRATIONS_DIR).map((file) => [
      file,
      readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'),
    ])
  )
);

export const viewsSql = readFileSync(new URL('../../../db/views.sql', import.meta.url), 'utf8');

export function openMemoryClient(): Promise<PGlite> {
  return PGlite.create({ extensions: { citext } });
}

export function dbOver(client: PGlite, overrideMigrations: readonly Migration[] = migrations): CbcDb {
  return new CbcDb(() => Promise.resolve(client), overrideMigrations, viewsSql);
}

export async function openTestDb(): Promise<{ db: CbcDb; client: PGlite }> {
  const client = await openMemoryClient();
  const db = dbOver(client);
  await db.init();
  return { db, client };
}

export async function scalar<T>(client: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const res = await client.query<Record<string, T>>(sql, params);
  return Object.values(res.rows[0])[0];
}
