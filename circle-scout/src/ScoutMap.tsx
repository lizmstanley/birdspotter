import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from '../../src/components/map/basemap.ts';

const START_CENTER: [number, number] = [-96, 39];
const START_ZOOM = 3;

export function ScoutMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: BASEMAP_STYLE_URL, center: START_CENTER, zoom: START_ZOOM });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    fallBackToBlankBasemap(map);
    return () => map.remove();
  }, []);

  return <div ref={containerRef} className="scout-map" />;
}
