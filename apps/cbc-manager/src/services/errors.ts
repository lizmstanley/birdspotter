export class AudubonProxyUnavailableError extends Error {
  readonly hostname: string;

  constructor(hostname: string) {
    super(
      'audubonCirclePage: this only works when the app runs on your computer (npm run dev), because the Audubon site blocks requests from other sites.'
    );
    this.hostname = hostname;
    this.name = 'AudubonProxyUnavailableError';
  }
}

export class AudubonRequestError extends Error {
  readonly circleCode: string;
  readonly status: number;

  constructor(circleCode: string, status: number) {
    super('audubonCirclePage: the circle page request failed.');
    this.circleCode = circleCode;
    this.status = status;
    this.name = 'AudubonRequestError';
  }
}

export class AudubonUnreachableError extends Error {
  readonly circleCode: string;

  constructor(circleCode: string, cause: unknown) {
    super('audubonCirclePage: the circle page could not be reached.', { cause });
    this.circleCode = circleCode;
    this.name = 'AudubonUnreachableError';
  }
}

export class InvalidKmlError extends Error {
  constructor() {
    super('kmlParser: the file is not valid KML.');
    this.name = 'InvalidKmlError';
  }
}

export class KmzMissingKmlError extends Error {
  constructor() {
    super('kmlParser: the .kmz archive has no .kml file inside.');
    this.name = 'KmzMissingKmlError';
  }
}

export class InvalidGeoJsonError extends Error {
  constructor() {
    super('kmlParser: GeoJSON must be a FeatureCollection.');
    this.name = 'InvalidGeoJsonError';
  }
}

export class InvalidCoordinatesError extends Error {
  readonly featureName: string;

  constructor(featureName: string) {
    super('kmlParser: a boundary has a coordinate that is not a valid longitude and latitude.');
    this.featureName = featureName;
    this.name = 'InvalidCoordinatesError';
  }
}

export class BoundaryFileTooLargeError extends Error {
  readonly part: 'archive' | 'unzipped';
  readonly sizeBytes: number;
  readonly limitBytes: number;

  constructor(part: 'archive' | 'unzipped', sizeBytes: number, limitBytes: number) {
    super(`kmlParser: the .kmz file is too large. The limit is ${Math.round(limitBytes / 1_000_000)} MB.`);
    this.part = part;
    this.sizeBytes = sizeBytes;
    this.limitBytes = limitBytes;
    this.name = 'BoundaryFileTooLargeError';
  }
}
