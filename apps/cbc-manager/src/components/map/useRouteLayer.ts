import { useEffect, type RefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, MultiLineString } from 'geojson';
import { ROUTES_SOURCE } from './mapLayers.ts';
import type { PartyRouteItem } from './types.ts';

interface RouteLayerOptions {
  readonly mapRef: RefObject<maplibregl.Map | null>;
  readonly mapReady: boolean;
  readonly routes: readonly PartyRouteItem[];
  readonly isHidden: boolean;
}

export function useRouteLayer({ mapRef, mapReady, routes, isHidden }: RouteLayerOptions) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const data: FeatureCollection<MultiLineString> = {
      type: 'FeatureCollection',
      features: isHidden
        ? []
        : routes.map((route) => ({
            type: 'Feature',
            properties: {},
            geometry: route.route_geojson,
          })),
    };
    (map.getSource(ROUTES_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(data);
  }, [mapRef, mapReady, routes, isHidden]);
}
