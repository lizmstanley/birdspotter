import { useEffect, type RefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { buildCirclePolygon } from '@birdspotter/birding-core/ebird.ts';
import { CIRCLE_SOURCE } from './mapLayers.ts';

interface CircleLayerOptions {
  readonly mapRef: RefObject<maplibregl.Map | null>;
  readonly markerRef: RefObject<maplibregl.Marker | null>;
  readonly mapReady: boolean;
  readonly lat: number;
  readonly lng: number;
  readonly radiusMiles: number;
  readonly isCircleShown: boolean;
}

export function useCircleLayer({
  mapRef,
  markerRef,
  mapReady,
  lat,
  lng,
  radiusMiles,
  isCircleShown,
}: CircleLayerOptions) {
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !mapReady) return;

    marker.setLngLat([lng, lat]);
    marker.getElement().style.display = isCircleShown ? '' : 'none';

    const src = map.getSource(CIRCLE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const data = isCircleShown
      ? buildCirclePolygon(lng, lat, radiusMiles)
      : { type: 'FeatureCollection' as const, features: [] };
    src.setData(data as never);
  }, [mapRef, markerRef, mapReady, lat, lng, radiusMiles, isCircleShown]);

  // Fit only when the circle itself moves or changes size, not when it is toggled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ring = buildCirclePolygon(lng, lat, radiusMiles).geometry.coordinates[0];
    const lngs = ring.map(([ringLng]) => ringLng);
    const lats = ring.map(([, ringLat]) => ringLat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 24, essential: true }
    );
  }, [mapRef, mapReady, lat, lng, radiusMiles]);
}
