import { circle } from '@turf/circle';
import { CBC_CIRCLE_RADIUS_MILES } from './cbcCircle.ts';
import { readTodaysCopy, saveTodaysCopy } from './ebirdCache.ts';
import { isLatitude, isLongitude } from './coordinates.ts';
import { EbirdKeyRejectedError, EbirdRequestError, UnexpectedResponseError, type EbirdEndpoint } from './errors.ts';
import { FETCH_TIMEOUT_MS, isRecord } from './http.ts';

export const EBIRD_SITE_URL = 'https://ebird.org';
export const EBIRD_KEY_REQUEST_URL = 'https://ebird.org/api/keygen';

const EBIRD_KEY_REJECTED_STATUS = 403;

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
}

export function buildCirclePolygon(lng: number, lat: number, radiusMiles = CBC_CIRCLE_RADIUS_MILES) {
  return circle([lng, lat], radiusMiles, {
    steps: 96,
    units: 'miles',
  });
}

function hasStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function isOptional(value: unknown, type: 'number' | 'string'): boolean {
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
    isOptional(value.howMany, 'number')
  );
}

async function fetchEbirdList<T>(
  endpoint: EbirdEndpoint,
  url: string,
  apiKey: string,
  isItem: (value: unknown) => value is T,
  maxAgeMs: number | undefined
): Promise<T[]> {
  const saved = readTodaysCopy(url, isItem, maxAgeMs);
  if (saved) return saved;
  const res = await fetch(url, {
    headers: { 'X-eBirdApiToken': apiKey.trim() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === EBIRD_KEY_REJECTED_STATUS) throw new EbirdKeyRejectedError(endpoint);
  if (!res.ok) throw new EbirdRequestError(endpoint, res.status, await res.text());
  const body: unknown = await res.json();
  if (!Array.isArray(body) || !body.every(isItem)) throw new UnexpectedResponseError('ebird', endpoint);
  saveTodaysCopy(url, body);
  return body;
}

function searchDistanceKm(radiusMiles: number): string {
  return Math.min(50, Math.max(1, radiusMiles * 1.609344)).toFixed(2);
}

/** @param maxAgeMs how old a saved copy may be; omitted, any copy saved today is used */
export async function fetchHotspotsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
  maxAgeMs?: number
): Promise<EbirdHotspot[]> {
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
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
  backDays = 7
): string {
  return `${recentObservationsUrl('recent', lat, lng, radiusMiles, backDays)}&fmt=json`;
}

/** Uses `detail=simple` so each report has the same fields as a regular sighting. */
export function recentNotableSightingsUrl(
  lat: number,
  lng: number,
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
  backDays = 7
): string {
  return `${recentObservationsUrl('recent/notable', lat, lng, radiusMiles, backDays)}&detail=simple&fmt=json`;
}

/** @param maxAgeMs how old a saved copy may be; omitted, any copy saved today is used */
export async function fetchRecentSightingsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
  backDays = 7,
  maxAgeMs?: number
): Promise<EbirdObservation[]> {
  const url = recentSightingsUrl(lat, lng, radiusMiles, backDays);
  return fetchEbirdList('sightings', url, apiKey, isObservation, maxAgeMs);
}

/**
 * Reports eBird marks as rare or out of season for the region. Unlike regular sightings, every report of a species
 * is returned, not only the latest.
 * @param maxAgeMs how old a saved copy may be; omitted, any copy saved today is used
 */
export async function fetchRecentNotableSightingsInCircle(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
  backDays = 7,
  maxAgeMs?: number
): Promise<EbirdObservation[]> {
  const url = recentNotableSightingsUrl(lat, lng, radiusMiles, backDays);
  return fetchEbirdList('notable sightings', url, apiKey, isObservation, maxAgeMs);
}
