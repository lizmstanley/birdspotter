import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, GeoJSON, Polygon, Position } from 'geojson';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from '../../src/components/map/basemap.ts';
import { addCircleLayers, CIRCLE_SOURCE } from '../../src/components/map/mapLayers.ts';
import type { AreaLinkData, AreaOutlineGeometry } from '../../src/services/areaLink.ts';
import { buildCirclePolygon } from '../../src/services/ebird.ts';
import { areaName } from './areaName.ts';
import { areaStatusAt, areaStatusText } from './areaStatus.ts';
import { addRouteLayers, ROUTE_SOURCE, routeFeatures } from './routeLayers.ts';
import type { AreaStorage } from './savedAreas.ts';
import type { LiveLocation } from './locationTracking.ts';
import { SessionPanel } from './SessionPanel.tsx';
import { sessionStretches } from './sessionStretches.ts';
import { useCountSession } from './useCountSession.ts';
import { useLiveLocation } from './useLiveLocation.ts';

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
  readonly storage: AreaStorage | null;
  readonly setError: (message: string | null) => void;
  readonly setNotice: (message: string | null) => void;
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
 * Shows the area's circle and outline, zoomed to the outline, the person's live location, and the count's route;
 * with no area, the start view, the location, and the route.
 */
export function ScoutMap({ area, storage, setError, setNotice }: ScoutMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState<ReadyMap | null>(null);
  const live = useLiveLocation(ready?.locationControl ?? null, storage);
  const circle = useMemo(() => (area ? buildCirclePolygon(area.circleCenter[0], area.circleCenter[1]) : null), [area]);
  const line = locationLine(live, area, circle);
  const count = useCountSession({ control: ready?.locationControl ?? null, storage, setError });
  const stretches = useMemo(() => (count.session ? sessionStretches(count.session) : []), [count.session]);

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
      addRouteLayers(map);
      setReady({ map, locationControl });
    });
    return () => {
      setReady(null);
      map.remove();
    };
  }, []);

  const readyMap = ready?.map ?? null;
  useEffect(() => {
    if (!readyMap) return;
    setSourceData(readyMap, CIRCLE_SOURCE, circle ?? NOTHING);
    setSourceData(readyMap, AREA_SOURCE, area?.outline ?? NOTHING);
    if (area) readyMap.fitBounds(outlineBounds(area.outline), { padding: FIT_PADDING_PX });
    else readyMap.jumpTo({ center: START_CENTER, zoom: START_ZOOM });
  }, [readyMap, area, circle]);

  useEffect(() => {
    if (readyMap) setSourceData(readyMap, ROUTE_SOURCE, routeFeatures(stretches));
  }, [readyMap, stretches]);

  return (
    <>
      {line && (
        <p className={line.isError ? 'scout-location scout-location-error' : 'scout-location'} role="status">
          {line.text}
        </p>
      )}
      <div ref={containerRef} className="scout-map" />
      <SessionPanel
        session={count.session}
        stretches={stretches}
        isScreenLockable={count.isScreenLockable}
        isLocationOff={ready !== null && !live.isTracking && live.error === null}
        onStart={() => count.start(area ? { name: areaName(area), code: area.areaCode } : null)}
        onStop={count.stop}
        onDiscard={count.discard}
        onSetMode={count.setStretchMode}
        onSetParticipants={count.setParticipants}
        onSetFeederHours={count.setFeederHours}
        setError={setError}
        setNotice={setNotice}
      />
    </>
  );
}
