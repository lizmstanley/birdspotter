import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon } from 'geojson';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import { CBC_CIRCLE_RADIUS_MILES } from '../../src/services/cbcCircle.ts';

/** [longitude, latitude] */
export type LngLat = readonly [number, number];

export interface Place {
  readonly lat: number;
  readonly lng: number;
}

export interface NearbyRow<T extends Place> {
  readonly item: T;
  readonly miles: number;
  readonly isInArea: boolean;
}

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

/** How far around the person the list looks when no area is loaded. */
export const NEARBY_RADIUS_MILES = CBC_CIRCLE_RADIUS_MILES;

const EARTH_RADIUS_MILES = 3958.8;
const WHOLE_MILES_FROM = 10;

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

export function formatDistance(miles: number): string {
  const tenths = miles.toFixed(1);
  if (Number(tenths) >= WHOLE_MILES_FROM) return `${Math.round(miles)} mi`;
  return `${tenths} mi`;
}

/**
 * Tests whether a place counts as in the person's area. A line outline has no inside, so the circle stands in for it.
 * @param circle the circle polygon drawn on the map
 */
export function isInAreaTest(area: AreaLinkData, circle: Feature<Polygon>): (place: Place) => boolean {
  const region = area.outline.type === 'LineString' ? circle : area.outline;
  return (place) => booleanPointInPolygon([place.lng, place.lat], region);
}

/** @returns places in the area first, then the rest, each group nearest first */
export function sortNearby<T extends Place>(
  items: readonly T[],
  position: LngLat,
  isInArea: ((place: Place) => boolean) | null
): NearbyRow<T>[] {
  const rows = items.map((item) => ({
    item,
    miles: distanceMiles(position, [item.lng, item.lat]),
    isInArea: isInArea?.(item) ?? false,
  }));
  return rows.sort((a, b) => Number(b.isInArea) - Number(a.isInArea) || a.miles - b.miles);
}

/**
 * Shows each species once. eBird returns every report of a notable species, so only the first is kept, and a species
 * shown as notable is left out of the regular rows.
 * @param notable rows as sortNearby orders them, so the report kept is in the area if one is, else the nearest
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
 * With an area, the whole count circle, so every place in the area is listed wherever the person stands.
 * With none, a radius around where the person was at the last query, moved once they are half the radius
 * away, so places within half the radius of them are always listed.
 * @param lastQuery the query in use, or null before the first
 * @returns the query to use now, or null when there is no area and no position yet
 */
export function nearbyQuery(
  area: AreaLinkData | null,
  position: LngLat | null,
  lastQuery: NearbyQuery | null
): NearbyQuery | null {
  if (area) return { center: area.circleCenter, radiusMiles: CBC_CIRCLE_RADIUS_MILES };
  if (!position) return null;
  const isStillCovered =
    lastQuery !== null && distanceMiles(lastQuery.center, position) <= lastQuery.radiusMiles - NEARBY_RADIUS_MILES / 2;
  if (isStillCovered) return lastQuery;
  return { center: position, radiusMiles: NEARBY_RADIUS_MILES };
}
