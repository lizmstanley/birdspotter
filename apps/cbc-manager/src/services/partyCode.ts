import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { isRecord } from '@birdspotter/birding-core/http.ts';
import { fromBase64Url, toBase64Url } from './base64Url.ts';

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
}

export const PARTY_CODE_FORMAT_VERSION = 1;
/** A reader finds the payload by this label, not by the line's position, since mail apps add lines after it. */
export const PARTY_CODE_LABEL = 'Party code';

// A party ID is a UUID; the cap keeps a damaged or hostile payload small.
const MAX_PARTY_ID_LENGTH = 64;
const MAX_PAYLOAD_LENGTH = 1000;
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

/** @returns the base64url payload for the party code line */
export function encodePartyCode(effort: PartyEffort): string {
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
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(packed)), { level: 9 }));
}

/** @returns the labeled line that ends the shared totals */
export function partyCodeLine(effort: PartyEffort): string {
  return `${PARTY_CODE_LABEL}: ${encodePartyCode(effort)}`;
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
  if (payload.length > MAX_PAYLOAD_LENGTH) throw new InvalidPartyCodeError('too long');
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

/**
 * @param payload the text after the party code label
 * @throws InvalidPartyCodeError when the payload is damaged or not a party code
 * @throws UnsupportedPartyCodeVersionError when the payload has a format version this code does not read
 */
export function decodePartyCode(payload: string): PartyEffort {
  const packed = readPacked(payload);
  if (!isRecord(packed)) throw new InvalidPartyCodeError('not an object');
  if (packed.v !== PARTY_CODE_FORMAT_VERSION) throw new UnsupportedPartyCodeVersionError(packed.v);
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
  };
}
