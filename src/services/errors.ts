export class EbirdRequestError extends Error {
  readonly endpoint: 'hotspots' | 'sightings';
  readonly status: number;
  readonly responseText: string;

  constructor(endpoint: 'hotspots' | 'sightings', status: number, responseText: string) {
    super(`ebird: the ${endpoint} request failed.`);
    this.endpoint = endpoint;
    this.status = status;
    this.responseText = responseText;
    this.name = 'EbirdRequestError';
  }
}

export class EbirdKeyRejectedError extends Error {
  readonly endpoint: 'hotspots' | 'sightings';

  constructor(endpoint: 'hotspots' | 'sightings') {
    super('ebird: eBird rejected the API key. Check the key on the Help & API Keys tab.');
    this.endpoint = endpoint;
    this.name = 'EbirdKeyRejectedError';
  }
}

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

export class UnexpectedResponseError extends Error {
  readonly source: 'ebird' | 'nominatim';
  readonly endpoint: string;

  constructor(source: 'ebird' | 'nominatim', endpoint: string) {
    super(`${source}: the ${endpoint} response was not in the expected format.`);
    this.source = source;
    this.endpoint = endpoint;
    this.name = 'UnexpectedResponseError';
  }
}
