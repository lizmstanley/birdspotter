import type { Map, StyleSpecification } from 'maplibre-gl';

// Hosted rather than copied so OpenFreeMap's tile, sprite, and font URLs stay current.
// MapLibre shows the attribution OpenFreeMap's tile source declares, which its terms require.
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const BLANK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/** Swaps in an empty style when the basemap style fails to load, so the map still fires `load` and overlays draw. */
export function fallBackToBlankBasemap(map: Pick<Map, 'once' | 'on' | 'setStyle'>): void {
  let hasStyle = false;
  map.once('style.load', () => {
    hasStyle = true;
  });
  // MapLibre never retries a failed style fetch, so `load` would never fire.
  map.on('error', () => {
    if (!hasStyle) map.setStyle(BLANK_STYLE);
  });
}
