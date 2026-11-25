import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon } from 'geojson';
import { buildCirclePolygon } from '@birdspotter/birding-core/ebird.ts';
import type { NearbyQuery, RegionTest } from '@birdspotter/birding-core/nearby.ts';
import type { AreaLinkData } from '../../../src/services/areaLink.ts';
import { CBC_CIRCLE_RADIUS_MILES } from '../../../src/services/cbcCircle.ts';

export function countCircle(area: AreaLinkData): Feature<Polygon> {
  const [lng, lat] = area.circleCenter;
  return buildCirclePolygon(lng, lat, CBC_CIRCLE_RADIUS_MILES);
}

/** The whole count circle, so every place in the area is listed wherever the person stands. */
export function countCircleQuery(area: AreaLinkData): NearbyQuery {
  return { center: area.circleCenter, radiusMiles: CBC_CIRCLE_RADIUS_MILES };
}

/**
 * Tests whether a place counts as in the person's area. A line outline has no inside, so the circle stands in for it.
 * @param circle the circle polygon drawn on the map
 */
export function isInAreaTest(area: AreaLinkData, circle: Feature<Polygon>): RegionTest {
  const region = area.outline.type === 'LineString' ? circle : area.outline;
  return (place) => booleanPointInPolygon([place.lng, place.lat], region);
}
