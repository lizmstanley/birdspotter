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
