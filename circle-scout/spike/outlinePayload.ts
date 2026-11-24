import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { simplify } from '@turf/simplify';
import type { LineString, MultiPolygon, Polygon, Position } from 'geojson';
import { isLatitude, isLongitude } from '../../src/services/coordinates.ts';
import { isRecord } from '../../src/services/http.ts';

export type OutlineGeometry = Polygon | MultiPolygon | LineString;

export interface Outline {
  readonly center: readonly [number, number];
  readonly geometry: OutlineGeometry;
}

export interface OutlineLink {
  readonly url: string;
  readonly bytes: number;
  readonly pointsIn: number;
  readonly pointsKept: number;
  readonly toleranceDegrees: number;
}

/** Byte-mode capacity of the largest QR code (version 40) at medium error correction. */
export const QR_MAX_BYTES_MEDIUM = 2331;

const PAYLOAD_VERSION = 1;
// 1e-5 degrees is about 1 m, finer than a phone's location fix.
const COORDINATE_SCALE = 1e5;
const MAX_PAYLOAD_POINTS = 20_000;
const SIMPLIFY_TOLERANCES_DEGREES = [0, 0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01];

const TYPE_CODES = { Polygon: 'P', MultiPolygon: 'M', LineString: 'L' } as const;
type TypeCode = (typeof TYPE_CODES)[keyof typeof TYPE_CODES];

interface PackedOutline {
  readonly v: number;
  readonly t: TypeCode;
  readonly c: readonly [number, number];
  readonly p: readonly (readonly (readonly number[])[])[];
}

export class InvalidOutlineLinkError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('outline link: the link does not hold a readable outline');
    this.name = 'InvalidOutlineLinkError';
    this.reason = reason;
  }
}

export class OutlineTooLargeError extends Error {
  readonly bytes: number;

  constructor(bytes: number) {
    super('outline link: the outline does not fit a QR code even after simplifying');
    this.name = 'OutlineTooLargeError';
    this.bytes = bytes;
  }
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
    if (!isLongitude(lng) || !isLatitude(lat)) throw new InvalidOutlineLinkError('position off the globe');
    line.push([lng, lat]);
  }
  return line;
}

export function geometryParts(geometry: OutlineGeometry): Position[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [[geometry.coordinates]];
}

function partsToGeometry(type: TypeCode, parts: Position[][][]): OutlineGeometry {
  if (type === 'P') return { type: 'Polygon', coordinates: parts[0] };
  if (type === 'M') return { type: 'MultiPolygon', coordinates: parts };
  return { type: 'LineString', coordinates: parts[0][0] };
}

export function countPoints(geometry: OutlineGeometry): number {
  return geometryParts(geometry)
    .flat()
    .reduce((total, line) => total + line.length, 0);
}

export function encodeOutline(outline: Outline): string {
  const packed: PackedOutline = {
    v: PAYLOAD_VERSION,
    t: TYPE_CODES[outline.geometry.type],
    c: [toScaled(outline.center[0]), toScaled(outline.center[1])],
    p: geometryParts(outline.geometry).map((part) => part.map(packLine)),
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }));
}

function isIntegerList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.length % 2 === 0 && value.every(Number.isSafeInteger);
}

function isPackedParts(value: unknown): value is number[][][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((part) => Array.isArray(part) && part.length > 0 && part.every(isIntegerList))
  );
}

function isTypeCode(value: unknown): value is TypeCode {
  return value === 'P' || value === 'M' || value === 'L';
}

function readPacked(payload: string): unknown {
  try {
    return JSON.parse(strFromU8(inflateSync(fromBase64Url(payload))));
  } catch {
    throw new InvalidOutlineLinkError('not compressed outline data');
  }
}

/** @throws InvalidOutlineLinkError when the payload is not an outline this page wrote */
export function decodeOutline(payload: string): Outline {
  const packed = readPacked(payload);
  if (!isRecord(packed) || packed.v !== PAYLOAD_VERSION) throw new InvalidOutlineLinkError('unknown format');
  if (!isTypeCode(packed.t) || !isIntegerList(packed.c) || packed.c.length !== 2) {
    throw new InvalidOutlineLinkError('missing type or center');
  }
  if (!isPackedParts(packed.p)) throw new InvalidOutlineLinkError('missing outline');
  const parts = packed.p.map((part) => part.map(unpackLine));
  const geometry = partsToGeometry(packed.t, parts);
  if (countPoints(geometry) > MAX_PAYLOAD_POINTS) throw new InvalidOutlineLinkError('too many points');
  const [lng, lat] = unpackLine(packed.c)[0];
  return { center: [lng, lat], geometry };
}

function simplified(geometry: OutlineGeometry, toleranceDegrees: number): OutlineGeometry {
  if (toleranceDegrees === 0) return geometry;
  return simplify(geometry, { tolerance: toleranceDegrees, highQuality: true });
}

/**
 * Simplifies the outline step by step until the link fits one QR code.
 * @throws OutlineTooLargeError when even the coarsest step does not fit
 */
export function buildOutlineLink(pageUrl: string, outline: Outline): OutlineLink {
  const encoder = new TextEncoder();
  let lastBytes = 0;
  for (const toleranceDegrees of SIMPLIFY_TOLERANCES_DEGREES) {
    const geometry = simplified(outline.geometry, toleranceDegrees);
    const url = `${pageUrl}#${encodeOutline({ center: outline.center, geometry })}`;
    lastBytes = encoder.encode(url).length;
    if (lastBytes <= QR_MAX_BYTES_MEDIUM) {
      return {
        url,
        bytes: lastBytes,
        pointsIn: countPoints(outline.geometry),
        pointsKept: countPoints(geometry),
        toleranceDegrees,
      };
    }
  }
  throw new OutlineTooLargeError(lastBytes);
}
