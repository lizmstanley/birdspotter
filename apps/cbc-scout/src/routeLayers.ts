import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import type { TravelMode } from './countSession.ts';
import type { Stretch } from './sessionStretches.ts';

export const ROUTE_SOURCE = 'scout-route';
export const MODE_COLORS: Readonly<Record<TravelMode, string>> = { foot: '#c2410c', car: '#6d28d9' };

const MODE_COLOR: ExpressionSpecification = ['match', ['get', 'mode'], 'car', MODE_COLORS.car, MODE_COLORS.foot];

export function addRouteLayers(map: MapLibreMap): void {
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: `${ROUTE_SOURCE}-line`,
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'isGap'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MODE_COLOR, 'line-width': 4 },
  });
  map.addLayer({
    id: `${ROUTE_SOURCE}-gap`,
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'isGap'], true],
    paint: { 'line-color': MODE_COLOR, 'line-width': 3, 'line-dasharray': [2, 2] },
  });
}

export function routeFeatures(stretches: readonly Stretch[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: stretches.map((stretch) => ({
      type: 'Feature',
      properties: { mode: stretch.mode, isGap: stretch.isGap },
      geometry: { type: 'LineString', coordinates: stretch.path.map(([lng, lat]) => [lng, lat]) },
    })),
  };
}
