import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { CbcDb } from './cbcDb.ts';
import { browserMigrations, browserViewsSql } from './browserMigrations.ts';

export type * from './types.ts';
export * from './errors.ts';

const BROWSER_DATA_DIR = 'idb://cbc-circle-manager-pgdata';

export class LocalCbcDb extends CbcDb {
  constructor() {
    super(
      () => PGlite.create(BROWSER_DATA_DIR, { extensions: { citext } }),
      browserMigrations,
      browserViewsSql
    );
  }
}
