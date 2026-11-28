import type { Feature, Polygon, Position } from 'geojson';
import type { AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';

const METERS_PER_DEGREE_LAT = 111_320;

interface PlanePoint {
  readonly x: number;
  readonly y: number;
}

function polygonRings(area: AreaLinkData): readonly (readonly Position[])[] {
  switch (area.outline.type) {
    case 'Polygon':
      return area.outline.coordinates;
    case 'MultiPolygon':
      return area.outline.coordinates.flat();
    case 'LineString':
      // A line has no inside, so it has no edge to cross.
      return [];
    default: {
      const unhandled: never = area.outline;
      return unhandled;
    }
  }
}

function metersToSegment(point: PlanePoint, start: PlanePoint, end: PlanePoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Meters from a point to the nearest edge of the area outline or the circle. Flat-earth math, which is close
 * enough across a count circle.
 * @param circle the circle polygon drawn on the map
 */
export function metersToNearestEdge(area: AreaLinkData, circle: Feature<Polygon>, lng: number, lat: number): number {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const toPlane = ([pointLng, pointLat]: Position): PlanePoint => ({
    x: (pointLng - lng) * metersPerDegreeLng,
    y: (pointLat - lat) * METERS_PER_DEGREE_LAT,
  });
  const origin: PlanePoint = { x: 0, y: 0 };
  let nearest = Infinity;
  for (const ring of [...circle.geometry.coordinates, ...polygonRings(area)]) {
    for (let index = 1; index < ring.length; index += 1) {
      nearest = Math.min(nearest, metersToSegment(origin, toPlane(ring[index - 1]), toPlane(ring[index])));
    }
  }
  return nearest;
}
