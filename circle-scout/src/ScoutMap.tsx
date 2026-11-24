import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, GeoJSON, Polygon, Position } from 'geojson';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from '../../src/components/map/basemap.ts';
import { addCircleLayers, CIRCLE_SOURCE } from '../../src/components/map/mapLayers.ts';
import type { AreaLinkData, AreaOutlineGeometry } from '../../src/services/areaLink.ts';
import { buildCirclePolygon } from '../../src/services/ebird.ts';
import { areaStatusAt, areaStatusText } from './areaStatus.ts';
import type { LiveLocation } from './locationTracking.ts';

const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;
const AREA_SOURCE = 'scout-area';
const AREA_COLOR = '#15803d';
const FIT_PADDING_PX = 40;
const NOTHING: FeatureCollection = { type: 'FeatureCollection', features: [] };
const POSITION_TIMEOUT_MS = 20_000;

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

interface ReadyMap {
  readonly map: maplibregl.Map;
  readonly locationControl: maplibregl.GeolocateControl;
}

interface ScoutMapProps {
  readonly area: AreaLinkData | null;
  readonly live: LiveLocation;
  /** Receives the map's location control once the map has loaded, and null when the map is removed. */
  readonly onLocationControl: (control: maplibregl.GeolocateControl | null) => void;
}

/** @returns the location line's text and whether it is an error, or null when there is nothing to say */
function locationLine(
  live: LiveLocation,
  area: AreaLinkData | null,
  circle: Feature<Polygon> | null
): { readonly text: string; readonly isError: boolean } | null {
  if (live.error) return { text: live.error, isError: true };
  if (!area || !circle || !live.isTracking) return null;
  if (!live.position) return { text: 'Finding your location…', isError: false };
  const [lng, lat] = live.position;
  return { text: areaStatusText(areaStatusAt(area, circle, lng, lat)), isError: false };
}

/**
 * Shows the area's circle and outline, zoomed to the outline, and the person's live location;
 * with no area, the start view and the location alone.
 */
export function ScoutMap({ area, live, onLocationControl }: ScoutMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState<ReadyMap | null>(null);
  const circle = useMemo(() => (area ? buildCirclePolygon(area.circleCenter[0], area.circleCenter[1]) : null), [area]);
  const line = locationLine(live, area, circle);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: BASEMAP_STYLE_URL, center: START_CENTER, zoom: START_ZOOM });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    // Added before load: its setup waits only on a permissions query, so it is done before a saved tracking state restarts it.
    const locationControl = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS },
      trackUserLocation: true,
      showAccuracyCircle: true,
    });
    map.addControl(locationControl, 'top-right');
    fallBackToBlankBasemap(map);
    map.once('load', () => {
      addCircleLayers(map);
      addAreaLayers(map);
      setReady({ map, locationControl });
    });
    return () => {
      setReady(null);
      map.remove();
    };
  }, []);

  const locationControl = ready?.locationControl ?? null;
  useEffect(() => {
    onLocationControl(locationControl);
    return () => onLocationControl(null);
  }, [locationControl, onLocationControl]);

  const readyMap = ready?.map ?? null;
  useEffect(() => {
    if (!readyMap) return;
    setSourceData(readyMap, CIRCLE_SOURCE, circle ?? NOTHING);
    setSourceData(readyMap, AREA_SOURCE, area?.outline ?? NOTHING);
    if (area) readyMap.fitBounds(outlineBounds(area.outline), { padding: FIT_PADDING_PX });
    else readyMap.jumpTo({ center: START_CENTER, zoom: START_ZOOM });
  }, [readyMap, area, circle]);

  return (
    <>
      {line && (
        <p className={line.isError ? 'scout-location scout-location-error' : 'scout-location'} role="status">
          {line.text}
        </p>
      )}
      <div ref={containerRef} className="scout-map" />
    </>
  );
}
