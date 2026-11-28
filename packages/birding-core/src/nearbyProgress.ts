import type { LiveLocation } from './locationTracking.ts';
import type { LngLat } from './nearby.ts';

function waitingText(live: LiveLocation): string {
  if (live.error) return live.error;
  if (live.isTracking) return 'Finding your location…';
  return 'Turn on location with the location button on the map to see what is nearby.';
}

/**
 * @param origin the point the rows are measured from, or null when none is known yet
 * @returns why no rows show yet, that eBird data is loading, or null once the rows are loaded
 */
export function nearbyProgressText(origin: LngLat | null, live: LiveLocation, isLoading: boolean): string | null {
  if (!origin) return waitingText(live);
  return isLoading ? 'Loading eBird data…' : null;
}
