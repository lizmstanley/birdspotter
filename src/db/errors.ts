export class MissingDefaultRsvpError extends Error {
  readonly email: string;

  constructor(email: string) {
    super('pgliteDb: a row has no RSVP and no default RSVP was chosen for new people.');
    this.email = email;
    this.name = 'MissingDefaultRsvpError';
  }
}

export class LegacyMigrationError extends Error {
  constructor(cause: unknown) {
    super(
      'pgliteDb: could not move your roster from the older database format. Nothing was changed.',
      { cause }
    );
    this.name = 'LegacyMigrationError';
  }
}

export class MigrationSequenceError extends Error {
  readonly expectedVersion: number;
  readonly foundVersion: number;

  constructor(expectedVersion: number, foundVersion: number) {
    super('migrations: versions must start at 1 and rise by 1 with no gaps.');
    this.expectedVersion = expectedVersion;
    this.foundVersion = foundVersion;
    this.name = 'MigrationSequenceError';
  }
}

export class MigrationFileNameError extends Error {
  readonly path: string;

  constructor(path: string) {
    super('migrations: file name must look like 001_name.sql.');
    this.path = path;
    this.name = 'MigrationFileNameError';
  }
}

export class SchemaTooNewError extends Error {
  readonly databaseVersion: number;
  readonly latestKnownVersion: number;

  constructor(databaseVersion: number, latestKnownVersion: number) {
    super('migrations: this database was upgraded by a newer version of the app. Reload to get the latest version.');
    this.databaseVersion = databaseVersion;
    this.latestKnownVersion = latestKnownVersion;
    this.name = 'SchemaTooNewError';
  }
}

export class DatabaseNotOpenError extends Error {
  constructor() {
    super('pgliteDb: call init() before using the database.');
    this.name = 'DatabaseNotOpenError';
  }
}
