import { circle } from '@turf/circle';
import { forgetRecentCopies, readRecentCopy, readTodaysCopy, saveTodaysCopy, type SavedItems } from './ebirdCache.ts';
import { isLatitude, isLongitude } from './coordinates.ts';
import { KM_PER_MILE } from './distanceUnit.ts';
import {
  EbirdKeyRejectedError,
  EbirdKeyUnsendableError,
  EbirdRequestError,
  EbirdUnreachableError,
  UnexpectedResponseError,
  type EbirdEndpoint,
} from './errors.ts';
import { FETCH_TIMEOUT_MS, isRecord } from './http.ts';

export const EBIRD_SITE_URL = 'https://ebird.org';
export const EBIRD_KEY_REQUEST_URL = 'https://ebird.org/api/keygen';

const EBIRD_KEY_REJECTED_STATUS = 403;

/** eBird's API terms allow observations only a short-term cache, of 1 to 6 hours. */
export const EBIRD_DATA_LIFETIME_MS = 6 * 60 * 60 * 1000;

export interface EbirdHotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  numSpeciesAllTime?: number;
  latestObsDt?: string;
}

export interface EbirdObservation {
  speciesCode: string;
  comName: string;
  sciName: string;
  locId: string;
  locName: string;
  obsDt: string;
  howMany?: number;
  lat: number;
  lng: number;
  subId: string;
  obsValid?: boolean;
}

export function buildCirclePolygon(lng: number, lat: number, radiusMiles: number) {
  return circle([lng, lat], radiusMiles, {
    steps: 96,
    units: 'miles',
  });
}

function hasStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function isOptional(value: unknown, type: 'boolean' | 'number' | 'string'): boolean {
  return value === undefined || typeof value === type;
}

function isHotspot(value: unknown): value is EbirdHotspot {
  return (
    isRecord(value) &&
    hasStrings(value, ['locId', 'locName']) &&
    isLatitude(value.lat) &&
    isLongitude(value.lng) &&
    isOptional(value.numSpeciesAllTime, 'number') &&
    isOptional(value.latestObsDt, 'string')
  );
}

function isObservation(value: unknown): value is EbirdObservation {
  return (
    isRecord(value) &&
    hasStrings(value, ['speciesCode', 'comName', 'sciName', 'locId', 'locName', 'obsDt', 'subId']) &&
    isLatitude(value.lat) &&
    isLongitude(value.lng) &&
    isOptional(value.howMany, 'number') &&
    isOptional(value.obsValid, 'boolean')
  );
}

/** A report is confirmed once eBird marks it valid; one still waiting for review is not. */
export function isConfirmedReport(observation: EbirdObservation): boolean {
  return observation.obsValid === true;
}

export interface EbirdList<T> {
  readonly items: T[];
  /** When eBird sent the items, in epoch milliseconds. */
  readonly fetchedAt: number;
  /** True when eBird could not be reached, so the items are a saved copy. */
  readonly isNoSignalCopy: boolean;
}

/** A dropped or weak signal: `fetch` fails to connect, or the response does not arrive in time. */
function isNoSignal(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === 'TimeoutError');
}

function savedList<T>(saved: SavedItems<T>, isNoSignalCopy: boolean): EbirdList<T> {
  return { items: saved.items, fetchedAt: saved.savedAt, isNoSignalCopy };
}

/**
 * The browser's own header rule decides which characters a key may hold. `fetch` would reject the same key with a
 * `TypeError`, which looks like no signal.
 * @throws EbirdKeyUnsendableError when the key cannot be sent in a request header
 */
function ebirdKeyHeaders(apiKey: string): Headers {
  try {
    return new Headers({ 'X-eBirdApiToken': apiKey.trim() });
  } catch (err) {
    if (err instanceof TypeError) throw new EbirdKeyUnsendableError(err);
    throw err;
  }
}

export const UNSENDABLE_KEY_TEXT =
  "That key has a character an eBird key can't have, so it was not saved. Copy the key again from eBird.";

/** @returns whether the browser can send the key to eBird */
export function isSendableEbirdKey(apiKey: string): boolean {
  try {
    ebirdKeyHeaders(apiKey);
    return true;
  } catch (err) {
    if (err instanceof EbirdKeyUnsendableError) return false;
    throw err;
  }
}

async function requestEbirdList<T>(
  endpoint: EbirdEndpoint,
  url: string,
  headers: Headers,
  isItem: (value: unknown) => value is T
): Promise<T[]> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === EBIRD_KEY_REJECTED_STATUS) {
    // A copy saved under the earlier key must not stand in for this one when the signal drops.
    forgetRecentCopies(url);
    throw new EbirdKeyRejectedError(endpoint);
  }
  if (!res.ok) throw new EbirdRequestError(endpoint, res.status, await res.text());
  const body: unknown = await res.json();
  if (!Array.isArray(body) || !body.every(isItem)) throw new UnexpectedResponseError('ebird', endpoint);
  return body;
}

/**
 * With no signal, falls back to a saved copy up to 6 hours old, whatever `maxAgeMs` is, including one saved before
 * midnight. An eBird error response does not fall back.
 * @throws EbirdKeyUnsendableError when the key cannot be sent, even when a saved copy exists
 * @throws EbirdUnreachableError with no signal and no such copy
 */
async function fetchEbirdList<T>(
  endpoint: EbirdEndpoint,
  url: string,
  apiKey: string,
  isItem: (value: unknown) => value is T,
  maxAgeMs: number | undefined,
  lifetimeMs?: number
): Promise<EbirdList<T>> {
  const headers = ebirdKeyHeaders(apiKey);
  const saved = readTodaysCopy(url, isItem, maxAgeMs);
  if (saved) return savedList(saved, false);
  let items: T[];
  try {
    items = await requestEbirdList(endpoint, url, headers, isItem);
  } catch (err) {
    if (!isNoSignal(err)) throw err;
    const fallback = readRecentCopy(url, isItem, EBIRD_DATA_LIFETIME_MS);
    if (fallback) return savedList(fallback, true);
    throw new EbirdUnreachableError(endpoint, err);
  }
  saveTodaysCopy(url, items, EBIRD_DATA_LIFETIME_MS, lifetimeMs);
  return { items, fetchedAt: Date.now(), isNoSignalCopy: false };
}

function fetchObservations(
  endpoint: EbirdEndpoint,
  url: string,
  apiKey: string,
  maxAgeMs: number | undefined
): Promise<EbirdList<EbirdObservation>> {
  const readAgeMs = Math.min(maxAgeMs ?? EBIRD_DATA_LIFETIME_MS, EBIRD_DATA_LIFETIME_MS);
  return fetchEbirdList(endpoint, url, apiKey, isObservation, readAgeMs, EBIRD_DATA_LIFETIME_MS);
}

function searchDistanceKm(radiusMiles: number): string {
  return Math.min(50, Math.max(1, radiusMiles * KM_PER_MILE)).toFixed(2);
}

/** @param maxAgeMs how old a saved copy may be; omitted, any copy saved today is used */
export async function fetchHotspotsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  maxAgeMs?: number
): Promise<EbirdList<EbirdHotspot>> {
  const url =
    `https://api.ebird.org/v2/ref/hotspot/geo?lat=${encodeURIComponent(lat)}` +
    `&lng=${encodeURIComponent(lng)}&dist=${searchDistanceKm(radiusMiles)}&fmt=json`;
  return fetchEbirdList('hotspots', url, apiKey, isHotspot, maxAgeMs);
}

export function ebirdChecklistUrl(subId: string): string {
  return `${EBIRD_SITE_URL}/checklist/${encodeURIComponent(subId)}`;
}

function recentObservationsUrl(path: string, lat: number, lng: number, radiusMiles: number, backDays: number): string {
  const clampedDays = Math.min(30, Math.max(1, backDays));
  return (
    `https://api.ebird.org/v2/data/obs/geo/${path}?lat=${encodeURIComponent(lat)}` +
    `&lng=${encodeURIComponent(lng)}&dist=${searchDistanceKm(radiusMiles)}&back=${clampedDays}`
  );
}

export function recentSightingsUrl(
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays = 7
): string {
  return `${recentObservationsUrl('recent', lat, lng, radiusMiles, backDays)}&fmt=json`;
}

/**
 * Uses `detail=simple` so each report has the same fields as a regular sighting, and
 * includes reports still waiting for review.
 */
export function recentNotableSightingsUrl(
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays = 7
): string {
  return `${recentObservationsUrl('recent/notable', lat, lng, radiusMiles, backDays)}&detail=simple&includeProvisional=true&fmt=json`;
}

/** Leaves out reports still waiting for review, as the regular sightings do. */
export function recentSpeciesSightingsUrl(
  speciesCode: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays: number
): string {
  return `${recentObservationsUrl(`recent/${encodeURIComponent(speciesCode)}`, lat, lng, radiusMiles, backDays)}&fmt=json`;
}

/** @param maxAgeMs how old a saved copy may be, at most 6 hours; omitted, 6 hours */
export async function fetchRecentSightingsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays = 7,
  maxAgeMs?: number
): Promise<EbirdList<EbirdObservation>> {
  const url = recentSightingsUrl(lat, lng, radiusMiles, backDays);
  return fetchObservations('sightings', url, apiKey, maxAgeMs);
}

/**
 * Reports eBird marks as rare or out of season for the region. Unlike regular sightings, every report of a species
 * is returned, not only the latest.
 * @param maxAgeMs how old a saved copy may be, at most 6 hours; omitted, 6 hours
 */
export async function fetchRecentNotableSightingsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays = 7,
  maxAgeMs?: number
): Promise<EbirdList<EbirdObservation>> {
  const url = recentNotableSightingsUrl(lat, lng, radiusMiles, backDays);
  return fetchObservations('notable sightings', url, apiKey, maxAgeMs);
}

/**
 * The latest report of one species at each place, where the regular sightings hold only its latest report anywhere.
 * @param maxAgeMs how old a saved copy may be, at most 6 hours; omitted, 6 hours
 */
export async function fetchRecentSpeciesSightingsInCircle(
  apiKey: string,
  speciesCode: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  backDays: number,
  maxAgeMs?: number
): Promise<EbirdList<EbirdObservation>> {
  const url = recentSpeciesSightingsUrl(speciesCode, lat, lng, radiusMiles, backDays);
  return fetchObservations('species sightings', url, apiKey, maxAgeMs);
}
