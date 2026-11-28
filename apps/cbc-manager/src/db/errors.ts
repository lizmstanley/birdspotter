export class MissingDefaultRsvpError extends Error {
  readonly email: string;

  constructor(email: string) {
    super('roster: a row has no RSVP and no default RSVP was chosen for new people.');
    this.email = email;
    this.name = 'MissingDefaultRsvpError';
  }
}

export class LegacyMigrationError extends Error {
  constructor(cause: unknown) {
    super(
      'migrations: could not move your roster from the older database format. Nothing was changed.',
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
    super('cbcDb: call init() before using the database.');
    this.name = 'DatabaseNotOpenError';
  }
}

export class CountDateOutsideSeasonError extends Error {
  readonly circleCode: string;
  readonly countDate: string;
  readonly season: number;

  constructor(circleCode: string, countDate: string, season: number) {
    super(`circles: the count date must be a real day from Dec 14, ${season} to Jan 5, ${season + 1}.`);
    this.circleCode = circleCode;
    this.countDate = countDate;
    this.season = season;
    this.name = 'CountDateOutsideSeasonError';
  }
}

export class SeasonRolloverError extends Error {
  readonly circleCode: string;
  readonly currentYear: number | null;
  readonly requestedYear: number;

  constructor(circleCode: string, currentYear: number | null, requestedYear: number) {
    super('seasons: a rollover needs a current season and a later year to move to.');
    this.circleCode = circleCode;
    this.currentYear = currentYear;
    this.requestedYear = requestedYear;
    this.name = 'SeasonRolloverError';
  }
}

export class CircleNotFoundError extends Error {
  readonly circleCode: string;

  constructor(circleCode: string) {
    super('circles: no saved circle has this code.');
    this.circleCode = circleCode;
    this.name = 'CircleNotFoundError';
  }
}

export class BackupFormatError extends Error {
  readonly table: string | null;

  constructor(table: string | null, cause?: unknown) {
    super('backup: this file is not a CBC Circle Manager backup.', { cause });
    this.table = table;
    this.name = 'BackupFormatError';
  }
}

export class NoCurrentSeasonError extends Error {
  readonly circleCode: string;

  constructor(circleCode: string) {
    super('parties: the circle has no current season to save the party in.');
    this.circleCode = circleCode;
    this.name = 'NoCurrentSeasonError';
  }
}
