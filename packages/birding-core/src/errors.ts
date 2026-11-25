export type EbirdEndpoint = 'hotspots' | 'sightings' | 'notable sightings';

export class EbirdRequestError extends Error {
  readonly endpoint: EbirdEndpoint;
  readonly status: number;
  readonly responseText: string;

  constructor(endpoint: EbirdEndpoint, status: number, responseText: string) {
    super(`ebird: the ${endpoint} request failed.`);
    this.endpoint = endpoint;
    this.status = status;
    this.responseText = responseText;
    this.name = 'EbirdRequestError';
  }
}

export class EbirdKeyRejectedError extends Error {
  readonly endpoint: EbirdEndpoint;

  constructor(endpoint: EbirdEndpoint) {
    super('ebird: eBird rejected the API key.');
    this.endpoint = endpoint;
    this.name = 'EbirdKeyRejectedError';
  }
}

export class EbirdUnreachableError extends Error {
  readonly endpoint: EbirdEndpoint;

  constructor(endpoint: EbirdEndpoint, cause: unknown) {
    super('ebird: eBird could not be reached.', { cause });
    this.endpoint = endpoint;
    this.name = 'EbirdUnreachableError';
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
