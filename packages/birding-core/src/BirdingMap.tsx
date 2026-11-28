import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from './basemap.ts';
import { mapPlaces, placeFeatures } from './mapPlaces.ts';
import { setUpMapWorker } from './mapWorker.ts';
import type { LngLat } from './nearby.ts';
import { PlacePopup } from './PlacePopup.tsx';
import { addPlaceLayers, handlePlaceTaps, showPlaces } from './placeLayers.ts';
import { useLatest } from './useLatest.ts';
import type { NearbyData } from './useNearbyData.ts';

const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;
const POSITION_TIMEOUT_MS = 20_000;
const POPUP_MAX_WIDTH = '280px';

export interface ReadyMap {
  readonly map: maplibregl.Map;
  readonly locationControl: maplibregl.GeolocateControl;
}

/** Shows the view the map opens with. */
export function showStartView(map: maplibregl.Map): void {
  map.jumpTo({ center: START_CENTER, zoom: START_ZOOM });
}

interface BirdingMapProps {
  /** Adds the app's own sources and layers, once, when the map has loaded, under the eBird places. */
  readonly addLayers?: (map: maplibregl.Map) => void;
  /** Receives the map and its location control after the layers are added, and null when the map is removed. */
  readonly onReady: (ready: ReadyMap | null) => void;
  /** The eBird data the lists show, drawn as places. */
  readonly data: Pick<NearbyData, 'hotspots' | 'regular' | 'notable'>;
  /** The person's position; with none, no places show, as the lists show no rows. */
  readonly position: LngLat | null;
}

/**
 * The base map with zoom buttons, a location button that follows the person, and the eBird places: grouped when
 * close, notable ones in amber, and a popup for a tapped place.
 */
export function BirdingMap({ addLayers, onReady, data, position }: BirdingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestAddLayers = useLatest(addLayers);
  const [ready, setReady] = useState<ReadyMap | null>(null);
  const [pickedLocId, setPickedLocId] = useState<string | null>(null);
  const [popupNode] = useState(() => document.createElement('div'));
  const hasPosition = position !== null;
  const { hotspots, regular, notable } = data;
  const places = useMemo(
    () => (hasPosition ? mapPlaces(hotspots, regular, notable) : []),
    [hasPosition, hotspots, regular, notable]
  );
  const picked = places.find((place) => place.locId === pickedLocId) ?? null;
  // A refresh that drops the picked place closes its popup.
  if (pickedLocId !== null && !picked) setPickedLocId(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setUpMapWorker();
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
      latestAddLayers.current?.(map);
      addPlaceLayers(map);
      handlePlaceTaps(map, setPickedLocId);
      setReady({ map, locationControl });
    });
    return () => {
      setReady(null);
      map.remove();
    };
  }, [latestAddLayers]);

  useEffect(() => {
    if (!ready) return;
    onReady(ready);
    return () => onReady(null);
  }, [ready, onReady]);

  const readyMap = ready?.map ?? null;
  useEffect(() => {
    if (readyMap) showPlaces(readyMap, placeFeatures(places));
  }, [readyMap, places]);

  const pickedLng = picked?.lng;
  const pickedLat = picked?.lat;
  useEffect(() => {
    if (!readyMap || pickedLocId === null || pickedLng === undefined || pickedLat === undefined) return;
    // The map's own taps pick or clear the place, so a tap on another place never races the popup's close.
    const popup = new maplibregl.Popup({ closeOnClick: false, maxWidth: POPUP_MAX_WIDTH })
      .setLngLat([pickedLng, pickedLat])
      .setDOMContent(popupNode)
      .addTo(readyMap);
    const clearPick = (): void => setPickedLocId(null);
    popup.on('close', clearPick);
    return () => {
      popup.off('close', clearPick);
      popup.remove();
    };
  }, [readyMap, pickedLocId, pickedLng, pickedLat, popupNode]);

  return (
    <>
      <div ref={containerRef} className="birding-map" />
      {picked && position && createPortal(<PlacePopup place={picked} position={position} />, popupNode)}
    </>
  );
}
