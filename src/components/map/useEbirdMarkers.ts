import { useEffect, type RefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { EbirdHotspot, EbirdObservation } from '../../services/ebird.ts';
import { addHotspotMarker, addSightingMarker } from './markers.ts';

interface EbirdMarkersOptions {
  readonly mapRef: RefObject<maplibregl.Map | null>;
  readonly mapReady: boolean;
  readonly hotspots: EbirdHotspot[];
  readonly sightings: EbirdObservation[];
  readonly showHotspots: boolean;
  readonly showSightings: boolean;
}

function useMarkers<T>(
  mapRef: RefObject<maplibregl.Map | null>,
  mapReady: boolean,
  items: T[],
  isShown: boolean,
  addMarker: (map: maplibregl.Map, item: T) => maplibregl.Marker
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isShown) return;
    const markers = items.map((item) => addMarker(map, item));
    return () => markers.forEach((m) => m.remove());
  }, [mapReady, items, isShown]);
}

export function useEbirdMarkers({
  mapRef,
  mapReady,
  hotspots,
  sightings,
  showHotspots,
  showSightings,
}: EbirdMarkersOptions) {
  useMarkers(mapRef, mapReady, hotspots, showHotspots, addHotspotMarker);
  useMarkers(mapRef, mapReady, sightings, showSightings, addSightingMarker);
}
