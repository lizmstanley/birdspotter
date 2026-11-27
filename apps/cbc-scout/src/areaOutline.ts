import type { Position } from 'geojson';
import type { AreaOutlineGeometry } from '@birdspotter/cbc-manager/services/areaLink.ts';

/** Degrees of longitude and latitude. */
export interface LngLatBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

function outlinePositions(outline: AreaOutlineGeometry): Position[] {
  switch (outline.type) {
    case 'Polygon':
      return outline.coordinates.flat();
    case 'MultiPolygon':
      return outline.coordinates.flat(2);
    case 'LineString':
      return outline.coordinates;
    default: {
      const unhandled: never = outline;
      return unhandled;
    }
  }
}

export function outlineBox(outline: AreaOutlineGeometry): LngLatBox {
  const positions = outlinePositions(outline);
  const lngs = positions.map(([lng]) => lng);
  const lats = positions.map(([, lat]) => lat);
  return { west: Math.min(...lngs), south: Math.min(...lats), east: Math.max(...lngs), north: Math.max(...lats) };
}
