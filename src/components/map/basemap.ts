import type { StyleSpecification } from 'maplibre-gl';
import type { BasemapKind } from './types.ts';

const BASEMAPS: Record<BasemapKind, { tile: string; attribution: string }> = {
  satellite: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  },
  street: {
    tile: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

export function getBasemapStyle(kind: BasemapKind): StyleSpecification {
  const { tile, attribution } = BASEMAPS[kind];
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles: [tile], tileSize: 256, attribution },
    },
    layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap' }],
  };
}
