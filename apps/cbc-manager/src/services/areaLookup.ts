import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { isOuterCircleName, type GeoJsonGeometry } from './kmlParser.ts';

export interface AreaOutline {
  readonly code: string;
  readonly label?: string | null;
  readonly boundary_geojson: GeoJsonGeometry;
}

/**
 * @returns the code of the first area outline that contains the point, or null when none does.
 * Lines and points can't contain anything, and the outer circle outline is not an area.
 */
export function findAreaAt(outlines: readonly AreaOutline[], lng: number, lat: number): string | null {
  for (const outline of outlines) {
    const geometry = outline.boundary_geojson;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
    if (isOuterCircleName(`${outline.code} ${outline.label ?? ''}`)) continue;
    if (booleanPointInPolygon([lng, lat], geometry as Parameters<typeof booleanPointInPolygon>[1])) {
      return outline.code;
    }
  }
  return null;
}
