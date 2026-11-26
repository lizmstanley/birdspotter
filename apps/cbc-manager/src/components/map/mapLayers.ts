import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';

export const CIRCLE_SOURCE = 'cbc-circle';
export const AREAS_SOURCE = 'cbc-areas';
export const AREAS_FILL_LAYER = 'cbc-areas-fill';

const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];

function addEmptyGeoJsonSource(map: MapLibreMap, id: string): void {
  map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
}

export function addCircleLayers(map: MapLibreMap): void {
  addEmptyGeoJsonSource(map, CIRCLE_SOURCE);
  map.addLayer({
    id: 'cbc-circle-fill',
    type: 'fill',
    source: CIRCLE_SOURCE,
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
  });
  map.addLayer({
    id: 'cbc-circle-outline',
    type: 'line',
    source: CIRCLE_SOURCE,
    paint: { 'line-color': '#1d4ed8', 'line-width': 3 },
  });
}

export function addAreaLayers(map: MapLibreMap): void {
  addEmptyGeoJsonSource(map, AREAS_SOURCE);
  map.addLayer({
    id: AREAS_FILL_LAYER,
    type: 'fill',
    source: AREAS_SOURCE,
    paint: {
      'fill-color': ['get', 'fillColor'],
      'fill-opacity': ['case', HOVER, ['get', 'hoverOpacity'], ['get', 'fillOpacity']],
    },
  });
  map.addLayer({
    id: 'cbc-areas-outline-halo',
    type: 'line',
    source: AREAS_SOURCE,
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', HOVER, 6.5, 4.5],
      'line-opacity': 0.85,
    },
  });
  map.addLayer({
    id: 'cbc-areas-outline',
    type: 'line',
    source: AREAS_SOURCE,
    paint: {
      'line-color': ['get', 'strokeColor'],
      'line-width': ['case', HOVER, 4.5, ['get', 'lineWidth']],
    },
  });
}
