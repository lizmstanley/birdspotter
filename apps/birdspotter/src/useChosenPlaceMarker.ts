import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { LngLat } from '@birdspotter/birding-core/nearby.ts';

const MARKER_COLOR = '#4d7c0f';

/** Marks the chosen place on the map while there is one. */
export function useChosenPlaceMarker(map: maplibregl.Map | null, place: LngLat | null): void {
  const lng = place?.[0];
  const lat = place?.[1];
  useEffect(() => {
    if (!map || lng === undefined || lat === undefined) return;
    const marker = new maplibregl.Marker({ color: MARKER_COLOR }).setLngLat([lng, lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, lng, lat]);
}
