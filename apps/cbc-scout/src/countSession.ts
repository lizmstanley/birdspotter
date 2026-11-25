import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';

export type TravelMode = 'foot' | 'car';

export interface RoutePoint {
  readonly lng: number;
  readonly lat: number;
  /** Milliseconds since the epoch */
  readonly time: number;
}

/** The counter's mode for every route segment whose middle falls between `from` and `to`. */
export interface ModeCorrection {
  readonly from: number;
  readonly to: number;
  readonly mode: TravelMode;
}

/** The area active when the count started. */
export interface SessionArea {
  readonly name: string;
  readonly code: string;
  readonly circleCode: string;
}

export interface CountSession {
  /** Tells one party's count from another's, so the compiler can spot the same count shared twice. */
  readonly partyId: string;
  readonly startTime: number;
  readonly stopTime: number | null;
  readonly areaName: string | null;
  /** The area number on the count sheet; null when no area was active. */
  readonly areaCode: string | null;
  readonly circleCode: string | null;
  /** People in the party, entered by the counter. */
  readonly participants: number;
  /** Entered by the counter; feeder watching is not part of the recorded route or its hours. */
  readonly feederHours: number;
  /** Runs of points recorded without a break; the space between two runs is a gap. */
  readonly tracks: readonly (readonly RoutePoint[])[];
  /** Later corrections win over earlier ones. */
  readonly corrections: readonly ModeCorrection[];
}

export interface LocationFix extends RoutePoint {
  /** Meters */
  readonly accuracy: number;
}

export const SESSION_STORAGE_KEY = 'cbc_scout_session';
const SESSION_FORMAT_VERSION = 1;
const MAX_ACCURACY_M = 50;
const MIN_STEP_M = 20;
const EARTH_RADIUS_M = 6_371_000;
const COORDINATE_DECIMALS = 6;

export function isParticipantCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

export function isFeederHours(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function startSession(
  startTime: number,
  area: SessionArea | null,
  partyId: string = crypto.randomUUID()
): CountSession {
  return {
    partyId,
    startTime,
    stopTime: null,
    areaName: area?.name ?? null,
    areaCode: area?.code ?? null,
    circleCode: area?.circleCode ?? null,
    participants: 1,
    feederHours: 0,
    tracks: [[]],
    corrections: [],
  };
}

export function stopSession(session: CountSession, stopTime: number): CountSession {
  return session.stopTime === null ? { ...session, stopTime } : session;
}

export function isRunning(session: CountSession | null): session is CountSession {
  return session !== null && session.stopTime === null;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function metersBetween(a: Pick<RoutePoint, 'lng' | 'lat'>, b: Pick<RoutePoint, 'lng' | 'lat'>): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lastPoint(session: CountSession): RoutePoint | null {
  for (let index = session.tracks.length - 1; index >= 0; index -= 1) {
    const point = session.tracks[index].at(-1);
    if (point) return point;
  }
  return null;
}

/**
 * Adds a fix to the current track. Rough fixes, fixes no newer than the last point, and moves smaller than the fix's
 * own accuracy are dropped, so standing still adds no miles.
 * @returns the same session when the fix is dropped
 */
export function withFix(session: CountSession, fix: LocationFix): CountSession {
  if (!isRunning(session) || fix.accuracy > MAX_ACCURACY_M || fix.time < session.startTime) return session;
  const previous = lastPoint(session);
  if (previous && fix.time <= previous.time) return session;
  const track = session.tracks.at(-1) ?? [];
  const trackEnd = track.at(-1);
  if (trackEnd && metersBetween(trackEnd, fix) < Math.max(MIN_STEP_M, fix.accuracy)) return session;
  const point: RoutePoint = { lng: fix.lng, lat: fix.lat, time: fix.time };
  return { ...session, tracks: [...session.tracks.slice(0, -1), [...track, point]] };
}

/** Ends the current track so the next fix starts a new one after a gap. */
export function withBreak(session: CountSession): CountSession {
  if (!isRunning(session) || session.tracks.at(-1)?.length === 0) return session;
  return { ...session, tracks: [...session.tracks, []] };
}

export function withCorrection(session: CountSession, correction: ModeCorrection): CountSession {
  return { ...session, corrections: [...session.corrections, correction] };
}

/** @returns the same session when the count is not a whole number of at least 1 */
export function withParticipants(session: CountSession, participants: number): CountSession {
  return isParticipantCount(participants) ? { ...session, participants } : session;
}

/** @returns the same session when the hours are negative or not a number */
export function withFeederHours(session: CountSession, feederHours: number): CountSession {
  return isFeederHours(feederHours) ? { ...session, feederHours } : session;
}

type StoredPoint = readonly [lng: number, lat: number, time: number];

interface StoredSession {
  readonly version: number;
  readonly partyId: string;
  readonly startTime: number;
  readonly stopTime: number | null;
  readonly areaName: string | null;
  readonly areaCode: string | null;
  readonly circleCode: string | null;
  readonly participants: number;
  readonly feederHours: number;
  readonly tracks: readonly (readonly StoredPoint[])[];
  readonly corrections: readonly ModeCorrection[];
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

function toStored(session: CountSession): StoredSession {
  return {
    version: SESSION_FORMAT_VERSION,
    partyId: session.partyId,
    startTime: session.startTime,
    stopTime: session.stopTime,
    areaName: session.areaName,
    areaCode: session.areaCode,
    circleCode: session.circleCode,
    participants: session.participants,
    feederHours: session.feederHours,
    tracks: session.tracks.map((track) =>
      track.map((point): StoredPoint => [roundCoordinate(point.lng), roundCoordinate(point.lat), point.time])
    ),
    corrections: session.corrections,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readPoint(value: unknown): RoutePoint | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) return null;
  const [lng, lat, time] = value;
  return { lng, lat, time };
}

function readTrack(value: unknown): RoutePoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.map(readPoint);
  return points.every((point) => point !== null) ? points : null;
}

function readCorrection(value: unknown): ModeCorrection | null {
  if (!isRecord(value) || !isFiniteNumber(value.from) || !isFiniteNumber(value.to)) return null;
  if (value.mode !== 'foot' && value.mode !== 'car') return null;
  return { from: value.from, to: value.to, mode: value.mode };
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

type PartyDetails = Pick<
  CountSession,
  'partyId' | 'areaName' | 'areaCode' | 'circleCode' | 'participants' | 'feederHours'
>;

function readPartyDetails(value: Record<string, unknown>): PartyDetails | null {
  const { partyId, areaName, areaCode, circleCode, participants, feederHours } = value;
  if (typeof partyId !== 'string' || partyId === '') return null;
  if (!isTextOrNull(areaName) || !isTextOrNull(areaCode) || !isTextOrNull(circleCode)) return null;
  if (!isFiniteNumber(participants) || !isFiniteNumber(feederHours)) return null;
  if (!isParticipantCount(participants) || !isFeederHours(feederHours)) return null;
  return { partyId, areaName, areaCode, circleCode, participants, feederHours };
}

function fromStored(value: unknown): CountSession | null {
  if (!isRecord(value) || value.version !== SESSION_FORMAT_VERSION || !isFiniteNumber(value.startTime)) return null;
  const { startTime, stopTime } = value;
  const details = readPartyDetails(value);
  if (!details || (stopTime !== null && !isFiniteNumber(stopTime))) return null;
  if (!Array.isArray(value.tracks) || !Array.isArray(value.corrections)) return null;
  const tracks = value.tracks.map(readTrack);
  const corrections = value.corrections.map(readCorrection);
  if (!tracks.every((track) => track !== null) || !corrections.every((item) => item !== null)) return null;
  return { startTime, stopTime, ...details, tracks: tracks.length > 0 ? tracks : [[]], corrections };
}

export type StoredSessionRead =
  | { readonly status: 'none' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'found'; readonly session: CountSession };

export function readCountSession(storage: KeyValueStorage): StoredSessionRead {
  const text = storage.getItem(SESSION_STORAGE_KEY);
  if (text === null) return { status: 'none' };
  try {
    const session = fromStored(JSON.parse(text));
    return session ? { status: 'found', session } : { status: 'unreadable' };
  } catch {
    return { status: 'unreadable' };
  }
}

/** @returns false when the browser blocks or fills storage */
export function writeCountSession(storage: KeyValueStorage, session: CountSession | null): boolean {
  try {
    if (session === null) storage.removeItem(SESSION_STORAGE_KEY);
    else storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toStored(session)));
    return true;
  } catch {
    return false;
  }
}
