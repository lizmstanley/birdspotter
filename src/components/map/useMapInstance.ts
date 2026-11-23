import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { getBasemapStyle } from './basemap.ts';
import { addAreaLayers, addCircleLayers } from './mapLayers.ts';
import { useLatest } from './useLatest.ts';
import type { BasemapKind } from './types.ts';

interface MapInstanceOptions {
  readonly basemap: BasemapKind;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly onPinDragged: (lat: number, lng: number) => void;
  readonly onMapNotice: (message: string) => void;
}

/** Builds the map again whenever the basemap changes. Layers exist once `mapReady` is true. */
export function useMapInstance({ basemap, centerLat, centerLng, onPinDragged, onMapNotice }: MapInstanceOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const onPinDraggedRef = useLatest(onPinDragged);
  const onMapNoticeRef = useLatest(onMapNotice);

  useEffect(() => {
    if (!containerRef.current) return;
    setMapReady(false);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(basemap),
      center: [centerLng, centerLat],
      zoom: 10.5,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const centerMarker = new maplibregl.Marker({ draggable: true, color: '#dc2626' })
      .setLngLat([centerLng, centerLat])
      .addTo(map);
    markerRef.current = centerMarker;

    centerMarker.on('dragend', () => {
      const { lng, lat } = centerMarker.getLngLat();
      onPinDraggedRef.current(Number(lat.toFixed(5)), Number(lng.toFixed(5)));
    });

    map.on('error', (ev) => {
      const msg = ev.error?.message || (typeof ev.error === 'string' ? ev.error : '');
      if (msg) onMapNoticeRef.current(`Map notice: ${msg}`);
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
  }, [basemap]);

  return { containerRef, mapRef, markerRef, mapReady };
}
