import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { simplify } from '@turf/simplify';
import type { LineString, MultiPolygon, Polygon, Position } from 'geojson';
import { isLatitude, isLongitude } from '@birdspotter/birding-core/coordinates.ts';
import { isRecord } from '@birdspotter/birding-core/http.ts';

export type AreaOutlineGeometry = Polygon | MultiPolygon | LineString;

export interface AreaLeader {
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface AreaLinkData {
  readonly circleCode: string;
  readonly circleName: string;
  /** [longitude, latitude] */
  readonly circleCenter: readonly [number, number];
  readonly areaCode: string;
  readonly areaLabel?: string;
  readonly outline: AreaOutlineGeometry;
  readonly leaders: readonly AreaLeader[];
}

export interface AreaLink {
  readonly url: string;
  readonly pointsIn: number;
  readonly pointsKept: number;
}

/** Byte-mode capacity of the largest QR code (version 40) at medium error correction. */
export const QR_MAX_BYTES_MEDIUM = 2331;
export const AREA_LINK_FORMAT_VERSION = 1;

// 1e-5 degrees is about 1 m, finer than a phone's location fix.
const COORDINATE_SCALE = 1e5;
const MAX_OUTLINE_POINTS = 20_000;
const MIN_RING_POINTS = 4;
const MIN_LINE_POINTS = 2;
const SIMPLIFY_TOLERANCES_DEGREES = [0, 0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01];

const TYPE_CODES = { Polygon: 'P', MultiPolygon: 'M', LineString: 'L' } as const;
type TypeCode = (typeof TYPE_CODES)[keyof typeof TYPE_CODES];

interface PackedLeader {
  readonly n: string;
  readonly p?: string;
  readonly e?: string;
}

interface PackedAreaLink {
  readonly v: number;
  readonly c: string;
  readonly n: string;
  readonly o: readonly [number, number];
  readonly a: string;
  readonly b?: string;
  readonly t: TypeCode;
  readonly p: readonly (readonly (readonly number[])[])[];
  readonly l?: readonly PackedLeader[];
}

export class InvalidAreaLinkError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('areaLink: the link does not hold a readable area');
    this.name = 'InvalidAreaLinkError';
    this.reason = reason;
  }
}

export class UnsupportedAreaLinkVersionError extends Error {
  readonly version: unknown;

  constructor(version: unknown) {
    super('areaLink: the link was made by a newer or unknown version of the app');
    this.name = 'UnsupportedAreaLinkVersionError';
    this.version = version;
  }
}

export class AreaLinkTooLargeError extends Error {
  readonly bytes: number;

  constructor(bytes: number) {
    super('areaLink: the area does not fit a QR code even after simplifying its outline');
    this.name = 'AreaLinkTooLargeError';
    this.bytes = bytes;
  }
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && isLongitude(value[0]) && isLatitude(value[1]);
}

function isLine(value: unknown, minPoints: number): value is Position[] {
  return Array.isArray(value) && value.length >= minPoints && value.every(isPosition);
}

function isRings(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.length > 0 && value.every((ring) => isLine(ring, MIN_RING_POINTS));
}

/** @returns the geometry typed for an area link, or null when it is a point or its coordinates are malformed */
export function toAreaOutlineGeometry(geometry: { readonly type: string; readonly coordinates: unknown }): AreaOutlineGeometry | null {
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && isRings(coordinates)) return { type, coordinates };
  if (type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isRings)) {
    return { type, coordinates };
  }
  if (type === 'LineString' && isLine(coordinates, MIN_LINE_POINTS)) return { type, coordinates };
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toScaled(value: number): number {
  return Math.round(value * COORDINATE_SCALE);
}

function packLine(line: readonly Position[]): number[] {
  const deltas: number[] = [];
  let prevX = 0;
  let prevY = 0;
  for (const position of line) {
    const x = toScaled(position[0]);
    const y = toScaled(position[1]);
    deltas.push(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return deltas;
}

function unpackLine(deltas: readonly number[]): Position[] {
  const line: Position[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    const lng = x / COORDINATE_SCALE;
    const lat = y / COORDINATE_SCALE;
    if (!isLongitude(lng) || !isLatitude(lat)) throw new InvalidAreaLinkError('position off the globe');
    line.push([lng, lat]);
  }
  return line;
}

function geometryParts(geometry: AreaOutlineGeometry): Position[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [[geometry.coordinates]];
}

function countPoints(geometry: AreaOutlineGeometry): number {
  return geometryParts(geometry)
    .flat()
    .reduce((total, line) => total + line.length, 0);
}

function packLeader(leader: AreaLeader): PackedLeader {
  return {
    n: leader.name,
    ...(leader.phone ? { p: leader.phone } : {}),
    ...(leader.email ? { e: leader.email } : {}),
  };
}

/** @returns the base64url text that goes after `#` in an area link */
export function encodeAreaLink(data: AreaLinkData): string {
  const packed: PackedAreaLink = {
    v: AREA_LINK_FORMAT_VERSION,
    c: data.circleCode,
    n: data.circleName,
    o: [toScaled(data.circleCenter[0]), toScaled(data.circleCenter[1])],
    a: data.areaCode,
    ...(data.areaLabel ? { b: data.areaLabel } : {}),
    t: TYPE_CODES[data.outline.type],
    p: geometryParts(data.outline).map((part) => part.map(packLine)),
    ...(data.leaders.length > 0 ? { l: data.leaders.map(packLeader) } : {}),
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || isText(value);
}

function isDeltaList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.length % 2 === 0 && value.every(Number.isSafeInteger);
}

function isPackedParts(value: unknown): value is number[][][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((part) => Array.isArray(part) && part.length > 0 && part.every(isDeltaList))
  );
}

function isTypeCode(value: unknown): value is TypeCode {
  return value === 'P' || value === 'M' || value === 'L';
}

function readPacked(payload: string): unknown {
  if (payload.length > QR_MAX_BYTES_MEDIUM) throw new InvalidAreaLinkError('longer than a QR code holds');
  try {
    return JSON.parse(strFromU8(inflateSync(fromBase64Url(payload))));
  } catch {
    throw new InvalidAreaLinkError('not compressed area data');
  }
}

function readLeader(value: unknown): AreaLeader {
  if (!isRecord(value) || !isText(value.n) || !isOptionalText(value.p) || !isOptionalText(value.e)) {
    throw new InvalidAreaLinkError('malformed leader');
  }
  return {
    name: value.n,
    ...(value.p !== undefined ? { phone: value.p } : {}),
    ...(value.e !== undefined ? { email: value.e } : {}),
  };
}

function readLeaders(value: unknown): AreaLeader[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new InvalidAreaLinkError('malformed leaders');
  return value.map(readLeader);
}

function partsToGeometry(type: TypeCode, parts: Position[][][]): AreaOutlineGeometry | null {
  if (type === 'M') return toAreaOutlineGeometry({ type: 'MultiPolygon', coordinates: parts });
  if (parts.length !== 1) return null;
  if (type === 'P') return toAreaOutlineGeometry({ type: 'Polygon', coordinates: parts[0] });
  if (parts[0].length !== 1) return null;
  return toAreaOutlineGeometry({ type: 'LineString', coordinates: parts[0][0] });
}

function readOutline(type: unknown, parts: unknown): AreaOutlineGeometry {
  if (!isTypeCode(type) || !isPackedParts(parts)) throw new InvalidAreaLinkError('missing outline');
  const outline = partsToGeometry(
    type,
    parts.map((part) => part.map(unpackLine))
  );
  if (!outline) throw new InvalidAreaLinkError('malformed outline');
  if (countPoints(outline) > MAX_OUTLINE_POINTS) throw new InvalidAreaLinkError('too many points');
  return outline;
}

/**
 * @param payload the text after `#` in an area link
 * @throws InvalidAreaLinkError when the payload is damaged or not an area link
 * @throws UnsupportedAreaLinkVersionError when the payload has a format version this code does not read
 */
export function decodeAreaLink(payload: string): AreaLinkData {
  const packed = readPacked(payload);
  if (!isRecord(packed)) throw new InvalidAreaLinkError('not an object');
  if (packed.v !== AREA_LINK_FORMAT_VERSION) throw new UnsupportedAreaLinkVersionError(packed.v);
  if (!isText(packed.c) || !isText(packed.n) || !isText(packed.a) || !isOptionalText(packed.b)) {
    throw new InvalidAreaLinkError('missing circle or area');
  }
  if (!isDeltaList(packed.o) || packed.o.length !== 2) throw new InvalidAreaLinkError('missing circle center');
  const [lng, lat] = unpackLine(packed.o)[0];
  return {
    circleCode: packed.c,
    circleName: packed.n,
    circleCenter: [lng, lat],
    areaCode: packed.a,
    ...(packed.b !== undefined ? { areaLabel: packed.b } : {}),
    outline: readOutline(packed.t, packed.p),
    leaders: readLeaders(packed.l),
  };
}

function simplified(geometry: AreaOutlineGeometry, toleranceDegrees: number): AreaOutlineGeometry {
  if (toleranceDegrees === 0) return geometry;
  return simplify(geometry, { tolerance: toleranceDegrees, highQuality: true });
}

/**
 * Simplifies the outline step by step until the link fits one QR code at medium error correction.
 * @param baseUrl the CBC Scout page the link opens
 * @throws AreaLinkTooLargeError when even the coarsest step does not fit
 */
export function buildAreaLink(baseUrl: string, data: AreaLinkData): AreaLink {
  const encoder = new TextEncoder();
  let lastBytes = 0;
  for (const toleranceDegrees of SIMPLIFY_TOLERANCES_DEGREES) {
    const outline = simplified(data.outline, toleranceDegrees);
    const url = `${baseUrl}#${encodeAreaLink({ ...data, outline })}`;
    lastBytes = encoder.encode(url).length;
    if (lastBytes <= QR_MAX_BYTES_MEDIUM) {
      return { url, pointsIn: countPoints(data.outline), pointsKept: countPoints(outline) };
    }
  }
  throw new AreaLinkTooLargeError(lastBytes);
}
