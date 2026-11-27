export class MapTooManyTilesError extends Error {
  readonly tileCount: number;

  constructor(tileCount: number) {
    super('offline map: the area needs more tiles than one download may fetch.');
    this.tileCount = tileCount;
    this.name = 'MapTooManyTilesError';
  }
}

export class MapTooLargeError extends Error {
  readonly byteLimit: number;

  constructor(byteLimit: number) {
    super('offline map: the area is larger than one download may store.');
    this.byteLimit = byteLimit;
    this.name = 'MapTooLargeError';
  }
}

export class MapFileRequestError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super('offline map: the map provider refused a file.');
    this.url = url;
    this.status = status;
    this.name = 'MapFileRequestError';
  }
}

export class MapUnreachableError extends Error {
  constructor(cause: unknown) {
    super('offline map: the map provider could not be reached.', { cause });
    this.name = 'MapUnreachableError';
  }
}

export class MapStyleFormatError extends Error {
  readonly part: string;

  constructor(part: string, cause?: unknown) {
    super('offline map: the map style was not in the expected format.', { cause });
    this.part = part;
    this.name = 'MapStyleFormatError';
  }
}

export class MapStorageError extends Error {
  constructor(cause: unknown) {
    super('offline map: the phone would not store the map.', { cause });
    this.name = 'MapStorageError';
  }
}

/** @returns what the counter reads when a map download stops */
export function describeMapDownloadError(error: unknown): string {
  if (error instanceof MapUnreachableError) return 'The street map stopped downloading. Try again with a stronger signal.';
  if (error instanceof MapTooManyTilesError) {
    return `This area needs ${error.tileCount} map tiles, more than one download may fetch. Ask your compiler to split it.`;
  }
  if (error instanceof MapTooLargeError) {
    return `This area's street map is over ${error.byteLimit / 1_000_000} MB, more than one download may store. Ask your compiler to split it.`;
  }
  if (error instanceof MapStorageError) return 'The phone would not store the street map. Free up some space and try again.';
  if (error instanceof MapFileRequestError) {
    return `OpenFreeMap refused part of the street map (HTTP ${error.status}). Try again later.`;
  }
  if (error instanceof MapStyleFormatError) return 'OpenFreeMap sent a street map CBC Scout could not read. Try again later.';
  return 'The street map could not be saved. Try again.';
}
