import { useEffect, useMemo, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, GeoJSON, Polygon } from 'geojson';
import { BirdingMap, showStartView, type ReadyMap } from '@birdspotter/birding-core/BirdingMap.tsx';
import type { LiveLocation } from '@birdspotter/birding-core/locationTracking.ts';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import type { NearbyData } from '@birdspotter/birding-core/useNearbyData.ts';
import { addCircleLayers, CIRCLE_SOURCE } from '@birdspotter/cbc-manager/components/map/mapLayers.ts';
import type { AreaLinkData, AreaOutlineGeometry } from '@birdspotter/cbc-manager/services/areaLink.ts';
import { areaName } from './areaName.ts';
import { outlineBox } from './areaOutline.ts';
import { countCircle } from './areaRegion.ts';
import { areaStatusAt, areaStatusText } from './areaStatus.ts';
import { addRouteLayers, ROUTE_SOURCE, routeFeatures } from './routeLayers.ts';
import { SessionPanel } from './SessionPanel.tsx';
import { sessionStretches } from './sessionStretches.ts';
import { useCountSession } from './useCountSession.ts';

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

function addScoutLayers(map: maplibregl.Map): void {
  addCircleLayers(map);
  addAreaLayers(map);
  addRouteLayers(map);
}

function outlineBounds(outline: AreaOutlineGeometry): maplibregl.LngLatBounds {
  const { west, south, east, north } = outlineBox(outline);
  return new maplibregl.LngLatBounds([west, south], [east, north]);
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: GeoJSON): void {
  const source = map.getSource(sourceId);
  if (source instanceof maplibregl.GeoJSONSource) source.setData(data);
}

interface ScoutMapProps {
  readonly area: AreaLinkData | null;
  readonly live: LiveLocation;
  /** The eBird data the lists show, kept to the area as they keep it. */
  readonly data: NearbyData;
  /** Receives the map's location control once the map has loaded, and null when the map is removed. */
  readonly onLocationControl: (control: maplibregl.GeolocateControl | null) => void;
  readonly storage: KeyValueStorage | null;
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
 * Shows the area's circle and outline, zoomed to the outline, the person's live location, the count's route, and the
 * eBird places; with no area, the start view, the location, the route, and the places.
 */
export function ScoutMap({ area, live, data, onLocationControl, storage, setError, setNotice }: ScoutMapProps) {
  const [ready, setReady] = useState<ReadyMap | null>(null);
  const circle = useMemo(() => (area ? countCircle(area) : null), [area]);
  const line = locationLine(live, area, circle);
  const count = useCountSession({ control: ready?.locationControl ?? null, storage, setError });
  const stretches = useMemo(() => (count.session ? sessionStretches(count.session) : []), [count.session]);

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
    else showStartView(readyMap);
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
      <BirdingMap addLayers={addScoutLayers} onReady={setReady} data={data} position={live.position} />
      <SessionPanel
        session={count.session}
        stretches={stretches}
        isScreenLockable={count.isScreenLockable}
        isLocationOff={ready !== null && !live.isTracking && live.error === null}
        onStart={() => count.start(area ? { name: areaName(area), code: area.areaCode, circleCode: area.circleCode } : null)}
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
