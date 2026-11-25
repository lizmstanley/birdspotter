import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from './basemap.ts';
import { useLatest } from './useLatest.ts';

const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;
const POSITION_TIMEOUT_MS = 20_000;

export interface ReadyMap {
  readonly map: maplibregl.Map;
  readonly locationControl: maplibregl.GeolocateControl;
}

/** Shows the view the map opens with. */
export function showStartView(map: maplibregl.Map): void {
  map.jumpTo({ center: START_CENTER, zoom: START_ZOOM });
}

interface BirdingMapProps {
  /** Adds the app's own sources and layers, once, when the map has loaded. */
  readonly addLayers: (map: maplibregl.Map) => void;
  /** Receives the map and its location control after `addLayers`, and null when the map is removed. */
  readonly onReady: (ready: ReadyMap | null) => void;
}

/** The base map with zoom buttons and a location button that follows the person. */
export function BirdingMap({ addLayers, onReady }: BirdingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestAddLayers = useLatest(addLayers);
  const [ready, setReady] = useState<ReadyMap | null>(null);

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
      latestAddLayers.current(map);
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

  return <div ref={containerRef} className="birding-map" />;
}
