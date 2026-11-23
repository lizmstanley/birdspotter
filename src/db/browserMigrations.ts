import { parseMigrationFiles } from './migrations.ts';
import viewsSql from '../../db/views.sql?raw';

const migrationFiles = import.meta.glob('../../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const browserMigrations = parseMigrationFiles(migrationFiles);
export const browserViewsSql: string = viewsSql;
