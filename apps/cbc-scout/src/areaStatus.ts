import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon } from 'geojson';
import { areaDisplayName } from '@birdspotter/cbc-manager/components/map/mapText.ts';
import type { AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';

export type AreaStatus =
  | { readonly kind: 'outside-circle' }
  | { readonly kind: 'in-area'; readonly areaName: string }
  | { readonly kind: 'outside-area' }
  /** The outline is a line, which has no inside, so only the circle can be tested. */
  | { readonly kind: 'in-circle' };

/**
 * Outside the circle wins over being in the area, because a bird seen outside the circle does not count.
 * @param circle the circle polygon drawn on the map, so the status matches what the person sees
 */
export function areaStatusAt(area: AreaLinkData, circle: Feature<Polygon>, lng: number, lat: number): AreaStatus {
  const point: [number, number] = [lng, lat];
  if (!booleanPointInPolygon(point, circle)) return { kind: 'outside-circle' };
  if (area.outline.type === 'LineString') return { kind: 'in-circle' };
  if (booleanPointInPolygon(point, area.outline)) return { kind: 'in-area', areaName: areaDisplayName(area.areaCode) };
  return { kind: 'outside-area' };
}

export function areaStatusText(status: AreaStatus): string {
  switch (status.kind) {
    case 'outside-circle':
      return 'Outside the circle';
    case 'in-area':
      return `In ${status.areaName}`;
    case 'outside-area':
      return 'Outside your area';
    case 'in-circle':
      return 'In the circle';
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}
