import { fromMiles, type DistanceUnit } from './distanceUnit.ts';

/** [longitude, latitude] */
export type LngLat = readonly [number, number];

export interface Place {
  readonly lat: number;
  readonly lng: number;
}

/** Tests whether a place is in the region the app lists first. */
export type RegionTest = (place: Place) => boolean;

export interface NearbyRow<T extends Place> {
  readonly item: T;
  readonly miles: number;
  /** Which way the place lies from the point rows are measured from, or null when too close for one to mean anything. */
  readonly direction: CompassPoint | null;
  readonly isInRegion: boolean;
}

export type CompassPoint = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Sighting extends Place {
  readonly speciesCode: string;
}

export interface SightingGroups<T extends Sighting> {
  readonly notable: readonly NearbyRow<T>[];
  readonly regular: readonly NearbyRow<T>[];
}

export interface NearbyQuery {
  readonly center: LngLat;
  readonly radiusMiles: number;
}

/** The default search radius around the person, in miles. */
export const NEARBY_RADIUS_MILES = 7.5;

const EARTH_RADIUS_MILES = 3958.8;
const WHOLE_UNITS_FROM = 10;
// Closer than this, GPS error can put the person on either side of the place.
const DIRECTION_MIN_MILES = 0.1;
const COMPASS_POINTS: readonly CompassPoint[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DEGREES_PER_POINT = 360 / COMPASS_POINTS.length;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance by the haversine formula. */
export function distanceMiles([fromLng, fromLat]: LngLat, [toLng, toLat]: LngLat): number {
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

/** @returns the initial great-circle bearing, in degrees clockwise from north, from 0 up to 360 */
export function bearingDegrees([fromLng, fromLat]: LngLat, [toLng, toLat]: LngLat): number {
  const fromPhi = toRadians(fromLat);
  const toPhi = toRadians(toLat);
  const dLng = toRadians(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toPhi);
  const x = Math.cos(fromPhi) * Math.sin(toPhi) - Math.sin(fromPhi) * Math.cos(toPhi) * Math.cos(dLng);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function compassPoint(bearing: number): CompassPoint {
  return COMPASS_POINTS[Math.round(bearing / DEGREES_PER_POINT) % COMPASS_POINTS.length];
}

export function directionTo(from: LngLat, to: LngLat, miles: number): CompassPoint | null {
  if (miles < DIRECTION_MIN_MILES) return null;
  return compassPoint(bearingDegrees(from, to));
}

export function formatDistance(miles: number, unit: DistanceUnit): string {
  const distance = fromMiles(miles, unit);
  const tenths = distance.toFixed(1);
  if (Number(tenths) >= WHOLE_UNITS_FROM) return `${Math.round(distance)} ${unit}`;
  return `${tenths} ${unit}`;
}

/** @returns places in the region first, then the rest, each group nearest first */
export function sortNearby<T extends Place>(
  items: readonly T[],
  position: LngLat,
  isInRegion: RegionTest | null
): NearbyRow<T>[] {
  const rows = items.map((item) => {
    const placeAt: LngLat = [item.lng, item.lat];
    const miles = distanceMiles(position, placeAt);
    return { item, miles, direction: directionTo(position, placeAt, miles), isInRegion: isInRegion?.(item) ?? false };
  });
  return rows.sort((a, b) => Number(b.isInRegion) - Number(a.isInRegion) || a.miles - b.miles);
}

/**
 * Shows each species once. eBird returns every report of a notable species, so only the first is kept, and a species
 * shown as notable is left out of the regular rows.
 * @param notable rows as sortNearby orders them, so the report kept is in the region if one is, else the nearest
 */
export function groupSightings<T extends Sighting>(
  regular: readonly NearbyRow<T>[],
  notable: readonly NearbyRow<T>[]
): SightingGroups<T> {
  const notableSpecies = new Set<string>();
  const firstNotable = notable.filter((row) => {
    if (notableSpecies.has(row.item.speciesCode)) return false;
    notableSpecies.add(row.item.speciesCode);
    return true;
  });
  return { notable: firstNotable, regular: regular.filter((row) => !notableSpecies.has(row.item.speciesCode)) };
}

/**
 * With a pinned query, that query, so every place in it is listed wherever the person stands.
 * With none, a radius around where the person was at the last query, moved once they are half the radius
 * away, so places within half the radius of them are always listed.
 * @param pinnedQuery the search the app holds in place, or null to follow the person
 * @param lastQuery the query in use, or null before the first
 * @param radiusMiles how far around the person to search when nothing is pinned; a change starts a new search
 * @returns the query to use now, or null when nothing is pinned and there is no position yet
 */
export function nearbyQuery(
  pinnedQuery: NearbyQuery | null,
  position: LngLat | null,
  lastQuery: NearbyQuery | null,
  radiusMiles: number
): NearbyQuery | null {
  if (pinnedQuery) return pinnedQuery;
  if (!position) return null;
  const isStillCovered =
    lastQuery !== null &&
    lastQuery.radiusMiles === radiusMiles &&
    distanceMiles(lastQuery.center, position) <= radiusMiles / 2;
  if (isStillCovered) return lastQuery;
  return { center: position, radiusMiles };
}
