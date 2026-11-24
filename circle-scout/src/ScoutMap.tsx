import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, GeoJSON, Position } from 'geojson';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from '../../src/components/map/basemap.ts';
import { addCircleLayers, CIRCLE_SOURCE } from '../../src/components/map/mapLayers.ts';
import type { AreaLinkData, AreaOutlineGeometry } from '../../src/services/areaLink.ts';
import { buildCirclePolygon } from '../../src/services/ebird.ts';

const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;
const AREA_SOURCE = 'scout-area';
const AREA_COLOR = '#15803d';
const FIT_PADDING_PX = 40;
const NOTHING: FeatureCollection = { type: 'FeatureCollection', features: [] };

function addAreaLayers(map: maplibregl.Map): void {
  map.addSource(AREA_SOURCE, { type: 'geojson', data: NOTHING });
  map.addLayer({
    id: `${AREA_SOURCE}-fill`,
    type: 'fill',
    source: AREA_SOURCE,
    paint: { 'fill-color': AREA_COLOR, 'fill-opacity': 0.15 },
  });
  map.addLayer({
    id: `${AREA_SOURCE}-line`,
    type: 'line',
    source: AREA_SOURCE,
    paint: { 'line-color': AREA_COLOR, 'line-width': 3 },
  });
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

function outlineBounds(outline: AreaOutlineGeometry): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const [lng, lat] of outlinePositions(outline)) bounds.extend([lng, lat]);
  return bounds;
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: GeoJSON): void {
  const source = map.getSource(sourceId);
  if (source instanceof maplibregl.GeoJSONSource) source.setData(data);
}

/** Shows the area's circle and outline, zoomed to the outline; with no area, the start view. */
export function ScoutMap({ area }: { readonly area: AreaLinkData | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [readyMap, setReadyMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: BASEMAP_STYLE_URL, center: START_CENTER, zoom: START_ZOOM });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    fallBackToBlankBasemap(map);
    map.once('load', () => {
      addCircleLayers(map);
      addAreaLayers(map);
      setReadyMap(map);
    });
    return () => {
      setReadyMap(null);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!readyMap) return;
    const circle = area ? buildCirclePolygon(area.circleCenter[0], area.circleCenter[1]) : NOTHING;
    setSourceData(readyMap, CIRCLE_SOURCE, circle);
    setSourceData(readyMap, AREA_SOURCE, area?.outline ?? NOTHING);
    if (area) readyMap.fitBounds(outlineBounds(area.outline), { padding: FIT_PADDING_PX });
    else readyMap.jumpTo({ center: START_CENTER, zoom: START_ZOOM });
  }, [readyMap, area]);

  return <div ref={containerRef} className="scout-map" />;
}
