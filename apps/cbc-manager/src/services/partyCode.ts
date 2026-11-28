import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { simplify } from '@turf/simplify';
import type { Position } from 'geojson';
import { isRecord } from '@birdspotter/birding-core/http.ts';
import { fromBase64Url, toBase64Url } from './base64Url.ts';
import { isDeltaList, packLine, SIMPLIFY_TOLERANCES_DEGREES, unpackLine } from './packedLine.ts';

export interface PartyArea {
  readonly circleCode: string;
  readonly areaCode: string;
}

/** One party's line of the count sheet. Hours and miles carry hundredths, as the shared text shows them. */
export interface PartyEffort {
  /** Stays the same each time one count is shared, so the compiler can spot a repeat. */
  readonly partyId: string;
  /** null when no area was active when the count started */
  readonly area: PartyArea | null;
  /** Milliseconds since the epoch */
  readonly startTime: number;
  /** Milliseconds since the epoch */
  readonly stopTime: number;
  readonly participants: number;
  readonly carHours: number;
  readonly footHours: number;
  readonly feederHours: number;
  readonly carMiles: number;
  readonly footMiles: number;
  /** Where the party went: one [longitude, latitude] line per run recorded without a break. Empty when none. */
  readonly route: readonly (readonly Position[])[];
}

export const PARTY_CODE_FORMAT_VERSION = 2;
/** A reader finds the payload by this label, not by the line's position, since mail apps add lines after it. */
export const PARTY_CODE_LABEL = 'Party code';
/** `partyCodeLine` simplifies the route until the payload fits, so the message stays short enough to text. */
export const PARTY_CODE_MAX_LENGTH = 2000;
// Version 1 codes, made before the route, may still be waiting in a compiler's messages.
const FORMAT_VERSION_WITHOUT_ROUTE = 1;
const READABLE_FORMAT_VERSIONS: readonly unknown[] = [FORMAT_VERSION_WITHOUT_ROUTE, PARTY_CODE_FORMAT_VERSION];

// A party ID is a UUID. The caps keep a damaged or hostile payload small; a route of real fixes that fits the length
// limit holds far fewer points.
const MAX_PARTY_ID_LENGTH = 64;
const MAX_ROUTE_POINTS = 10_000;
const MIN_LINE_POINTS = 2;
const AMOUNT_DECIMALS = 2;

interface PackedPartyEffort {
  readonly v: number;
  readonly p: string;
  readonly c?: string;
  readonly a?: string;
  readonly s: number;
  readonly e: number;
  readonly n: number;
  readonly hv: number;
  readonly hf: number;
  readonly hw: number;
  readonly mv: number;
  readonly mf: number;
  readonly r?: readonly (readonly number[])[];
}

export class InvalidPartyCodeError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('partyCode: the text does not hold a readable party code');
    this.name = 'InvalidPartyCodeError';
    this.reason = reason;
  }
}

export class UnsupportedPartyCodeVersionError extends Error {
  readonly version: unknown;

  constructor(version: unknown) {
    super('partyCode: the party code was made by a newer or unknown version of CBC Scout');
    this.name = 'UnsupportedPartyCodeVersionError';
    this.version = version;
  }
}

function roundAmount(value: number): number {
  return Number(value.toFixed(AMOUNT_DECIMALS));
}

function routeLines(route: PartyEffort['route']): PartyEffort['route'] {
  return route.filter((line) => line.length >= MIN_LINE_POINTS);
}

function countRoutePoints(route: PartyEffort['route']): number {
  return route.reduce((total, line) => total + line.length, 0);
}

/** @returns the base64url payload for the party code line, with every point of the route; lines under two points are left out */
export function encodePartyCode(effort: PartyEffort): string {
  const lines = routeLines(effort.route);
  const route = lines.map((line, index) => packLine(line, lines[index - 1]?.at(-1)));
  const packed: PackedPartyEffort = {
    v: PARTY_CODE_FORMAT_VERSION,
    p: effort.partyId,
    ...(effort.area ? { c: effort.area.circleCode, a: effort.area.areaCode } : {}),
    s: effort.startTime,
    e: effort.stopTime,
    n: effort.participants,
    hv: roundAmount(effort.carHours),
    hf: roundAmount(effort.footHours),
    hw: roundAmount(effort.feederHours),
    mv: roundAmount(effort.carMiles),
    mf: roundAmount(effort.footMiles),
    ...(route.length > 0 ? { r: route } : {}),
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }));
}

function simplifiedRoute(route: PartyEffort['route'], toleranceDegrees: number): PartyEffort['route'] {
  if (toleranceDegrees === 0) return routeLines(route);
  return routeLines(route).map(
    (line) =>
      simplify({ type: 'LineString', coordinates: [...line] }, { tolerance: toleranceDegrees, highQuality: true })
        .coordinates
  );
}

/** A route too large even at the coarsest step is left out, so every count still gets its totals in a code. */
function fittedPayload(effort: PartyEffort): string {
  for (const toleranceDegrees of SIMPLIFY_TOLERANCES_DEGREES) {
    const route = simplifiedRoute(effort.route, toleranceDegrees);
    if (countRoutePoints(route) > MAX_ROUTE_POINTS) continue;
    const payload = encodePartyCode({ ...effort, route });
    if (payload.length <= PARTY_CODE_MAX_LENGTH) return payload;
  }
  return encodePartyCode({ ...effort, route: [] });
}

/** @returns the labeled line that ends the shared totals, its route simplified to fit `PARTY_CODE_MAX_LENGTH` */
export function partyCodeLine(effort: PartyEffort): string {
  return `${PARTY_CODE_LABEL}: ${fittedPayload(effort)}`;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function readPacked(payload: string): unknown {
  if (payload.length > PARTY_CODE_MAX_LENGTH) throw new InvalidPartyCodeError('too long');
  try {
    return JSON.parse(strFromU8(inflateSync(fromBase64Url(payload))));
  } catch {
    throw new InvalidPartyCodeError('not compressed party data');
  }
}

function readArea(circleCode: unknown, areaCode: unknown): PartyArea | null {
  if (circleCode === undefined && areaCode === undefined) return null;
  if (!isText(circleCode) || !isText(areaCode)) throw new InvalidPartyCodeError('malformed circle or area');
  return { circleCode, areaCode };
}

function readTimes(startTime: unknown, stopTime: unknown): Pick<PartyEffort, 'startTime' | 'stopTime'> {
  if (!isWholeNumber(startTime) || !isWholeNumber(stopTime)) throw new InvalidPartyCodeError('missing times');
  if (stopTime < startTime) throw new InvalidPartyCodeError('stop before start');
  return { startTime, stopTime };
}

function isPackedRoute(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((line) => isDeltaList(line) && line.length >= MIN_LINE_POINTS * 2);
}

function readRoute(version: unknown, value: unknown): Position[][] {
  if (version === FORMAT_VERSION_WITHOUT_ROUTE || value === undefined) return [];
  if (!isPackedRoute(value)) throw new InvalidPartyCodeError('malformed route');
  const points = value.reduce((total, line) => total + line.length / 2, 0);
  if (points > MAX_ROUTE_POINTS) throw new InvalidPartyCodeError('too many route points');
  const route: Position[][] = [];
  for (const deltas of value) {
    const line = unpackLine(deltas, route.at(-1)?.at(-1));
    if (!line) throw new InvalidPartyCodeError('route off the globe');
    route.push(line);
  }
  return route;
}

/**
 * @param payload the text after the party code label
 * @throws InvalidPartyCodeError when the payload is damaged or not a party code
 * @throws UnsupportedPartyCodeVersionError when the payload has a format version this code does not read
 */
export function decodePartyCode(payload: string): PartyEffort {
  const packed = readPacked(payload);
  if (!isRecord(packed)) throw new InvalidPartyCodeError('not an object');
  if (!READABLE_FORMAT_VERSIONS.includes(packed.v)) throw new UnsupportedPartyCodeVersionError(packed.v);
  if (!isText(packed.p) || packed.p.length > MAX_PARTY_ID_LENGTH) throw new InvalidPartyCodeError('malformed party ID');
  if (!isWholeNumber(packed.n) || packed.n < 1) throw new InvalidPartyCodeError('malformed participants');
  const { hv, hf, hw, mv, mf } = packed;
  if (!isAmount(hv) || !isAmount(hf) || !isAmount(hw) || !isAmount(mv) || !isAmount(mf)) {
    throw new InvalidPartyCodeError('malformed hours or miles');
  }
  return {
    partyId: packed.p,
    area: readArea(packed.c, packed.a),
    ...readTimes(packed.s, packed.e),
    participants: packed.n,
    carHours: hv,
    footHours: hf,
    feederHours: hw,
    carMiles: mv,
    footMiles: mf,
    route: readRoute(packed.v, packed.r),
  };
}
