import * as maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from '../../src/components/map/basemap.ts';
import { geometryParts, type Outline } from './outlinePayload.ts';

const OUTLINE_SOURCE = 'shared-outline';
const OUTLINE_COLOR = '#2563eb';
const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;
const FIT_PADDING_PX = 40;

export interface SpikeMap {
  readonly map: maplibregl.Map;
  readonly loaded: Promise<void>;
}

export function createSpikeMap(container: HTMLElement): SpikeMap {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE_URL,
    center: START_CENTER,
    zoom: START_ZOOM,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  fallBackToBlankBasemap(map);
  const loaded = new Promise<void>((resolve) => map.once('load', () => resolve()));
  return { map, loaded };
}

function outlineBounds(outline: Outline): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const line of geometryParts(outline.geometry).flat()) {
    for (const position of line) bounds.extend([position[0], position[1]]);
  }
  return bounds;
}

function addOutlineLayers(map: maplibregl.Map, outline: Outline): void {
  map.addSource(OUTLINE_SOURCE, { type: 'geojson', data: outline.geometry });
  map.addLayer({
    id: `${OUTLINE_SOURCE}-fill`,
    type: 'fill',
    source: OUTLINE_SOURCE,
    paint: { 'fill-color': OUTLINE_COLOR, 'fill-opacity': 0.15 },
  });
  map.addLayer({
    id: `${OUTLINE_SOURCE}-line`,
    type: 'line',
    source: OUTLINE_SOURCE,
    paint: { 'line-color': OUTLINE_COLOR, 'line-width': 3 },
  });
}

/** Draws the outline and its circle center, replacing any outline drawn before, and zooms to it. */
export function createOutlineDrawer({ map, loaded }: SpikeMap): (outline: Outline) => Promise<void> {
  const centerMarker = new maplibregl.Marker({ color: '#dc2626' });

  return async (outline) => {
    await loaded;
    const source = map.getSource(OUTLINE_SOURCE);
    if (source instanceof maplibregl.GeoJSONSource) source.setData(outline.geometry);
    else addOutlineLayers(map, outline);
    centerMarker.setLngLat([outline.center[0], outline.center[1]]).addTo(map);
    map.fitBounds(outlineBounds(outline), { padding: FIT_PADDING_PX });
  };
}
