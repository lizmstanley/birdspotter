import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE_URL } from './basemap.ts';
import { addAreaLayers, addCircleLayers } from './mapLayers.ts';
import { useLatest } from '../../hooks/useLatest.ts';

const BLANK_STYLE: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [] };

interface MapInstanceOptions {
  readonly centerLat: number;
  readonly centerLng: number;
  readonly onPinDragged: (lat: number, lng: number) => void;
  readonly onMapNotice: (message: string) => void;
}

/** Builds the map once. Layers exist once `mapReady` is true. */
export function useMapInstance({ centerLat, centerLng, onPinDragged, onMapNotice }: MapInstanceOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const onPinDraggedRef = useLatest(onPinDragged);
  const onMapNoticeRef = useLatest(onMapNotice);
  // Only a new map starts at the saved center; useCircleLayer moves the pin on an existing one.
  const centerRef = useLatest({ lat: centerLat, lng: centerLng });

  useEffect(() => {
    if (!containerRef.current) return;
    setMapReady(false);
    const center = centerRef.current;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 10.5,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const centerMarker = new maplibregl.Marker({ draggable: true, color: '#dc2626' })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    markerRef.current = centerMarker;

    centerMarker.on('dragend', () => {
      const { lng, lat } = centerMarker.getLngLat();
      onPinDraggedRef.current(Number(lat.toFixed(5)), Number(lng.toFixed(5)));
    });

    let hasStyle = false;
    map.once('style.load', () => {
      hasStyle = true;
    });

    map.on('error', (ev) => {
      const msg = ev.error?.message || (typeof ev.error === 'string' ? ev.error : '');
      if (msg) onMapNoticeRef.current(`Map notice: ${msg}`);
      // MapLibre never retries a failed style fetch, so `load` would never fire and no overlay would draw.
      if (!hasStyle) map.setStyle(BLANK_STYLE);
    });

    map.on('load', () => {
      // Layers exist before any data arrives so data updates never race with tile loading.
      addCircleLayers(map);
      addAreaLayers(map);
      setMapReady(true);
    });

    return () => {
      centerMarker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [centerRef, onPinDraggedRef, onMapNoticeRef]);

  return { containerRef, mapRef, markerRef, mapReady };
}
