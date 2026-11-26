import type { PGlite } from '@electric-sql/pglite';

export type Queryable = Pick<PGlite, 'query' | 'exec'>;
