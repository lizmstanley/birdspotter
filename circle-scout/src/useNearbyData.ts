import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import { describeError } from '../../src/services/describeError.ts';
import { EbirdKeyRejectedError } from '../../src/services/errors.ts';
import {
  fetchHotspotsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdObservation,
} from '../../src/services/ebird.ts';
import { nearbyQuery, type LngLat, type NearbyQuery } from './nearby.ts';

/** A failed fetch is most often a dropped signal, which comes back within minutes. */
const RETRY_AFTER_ERROR_MS = 60 * 1000;

interface NearbyRequest {
  readonly query: NearbyQuery;
  readonly backDays: number;
  /** Changes on each scheduled refresh, so the same query is fetched again. */
  readonly refreshCount: number;
}

export interface NearbyData {
  readonly hotspots: readonly EbirdHotspot[];
  readonly sightings: readonly EbirdObservation[];
  readonly error: string | null;
  readonly isKeyRejected: boolean;
  readonly isLoading: boolean;
}

interface LoadedData {
  readonly request: NearbyRequest;
  readonly hotspots: readonly EbirdHotspot[];
  readonly sightings: readonly EbirdObservation[];
  readonly error: string | null;
  /** A rejected key fails the same way on every retry, so only other failures retry soon. */
  readonly isKeyRejected: boolean;
}

const NO_DATA: Omit<LoadedData, 'request'> = { hotspots: [], sightings: [], error: null, isKeyRejected: false };

/**
 * Fetches the eBird data for the Nearby list and fetches it again at each interval while the page is shown.
 * @param refreshMs both the refresh interval and the saved-copy age limit. A copy just short of this age when
 *   the list loads is replaced at the next refresh, so what the list shows is never twice this old.
 */
export function useNearbyData(
  apiKey: string,
  area: AreaLinkData | null,
  position: LngLat | null,
  backDays: number,
  refreshMs: number
): NearbyData {
  const [query, setQuery] = useState<NearbyQuery | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [loaded, setLoaded] = useState<LoadedData | null>(null);

  const nextQuery = nearbyQuery(area, position, query);
  // Kept in state so it moves only when nearbyQuery moves it, not on every location fix.
  if (nextQuery !== query && !isSameQuery(nextQuery, query)) setQuery(nextQuery);

  const request = query ? { query, backDays, refreshCount } : null;
  const [lng, lat] = query?.center ?? [0, 0];
  const radiusMiles = query?.radiusMiles ?? 0;
  const hasQuery = query !== null;

  useEffect(() => {
    if (!hasQuery) return;
    const thisRequest = { query: { center: [lng, lat] as const, radiusMiles }, backDays, refreshCount };
    let isCurrent = true;
    Promise.all([
      fetchHotspotsInCircle(apiKey, lat, lng, radiusMiles, refreshMs),
      fetchRecentSightingsInCircle(apiKey, lat, lng, radiusMiles, backDays, refreshMs),
    ])
      .then(([hotspots, sightings]) => {
        if (isCurrent) setLoaded({ request: thisRequest, hotspots, sightings, error: null, isKeyRejected: false });
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        // The last rows stay up, so a dropped signal does not empty the list.
        setLoaded((last) => ({
          ...(last ?? NO_DATA),
          request: thisRequest,
          error: describeError(err),
          isKeyRejected: err instanceof EbirdKeyRejectedError,
        }));
      });
    return () => {
      isCurrent = false;
    };
  }, [apiKey, hasQuery, lng, lat, radiusMiles, backDays, refreshCount, refreshMs]);

  const shouldRetrySoon = loaded?.error != null && !loaded.isKeyRejected;
  const refreshDelayMs = shouldRetrySoon ? RETRY_AFTER_ERROR_MS : refreshMs;
  useRefreshWhileShown(loaded?.request ?? null, refreshDelayMs, setRefreshCount);

  const isLoading = request !== null && !isSameRequest(loaded?.request ?? null, request);
  const shown = loaded ?? NO_DATA;
  return {
    hotspots: shown.hotspots,
    sightings: shown.sightings,
    error: shown.error,
    isKeyRejected: shown.isKeyRejected,
    isLoading,
  };
}

/**
 * Counts up a while after each load, or when the page is next shown if it was hidden then.
 * A phone can pause timers while the page is hidden, so the visibility check covers a timer that never fired.
 * @param delayMs how long after the load to count up
 */
function useRefreshWhileShown(
  loadedRequest: NearbyRequest | null,
  delayMs: number,
  setRefreshCount: Dispatch<SetStateAction<number>>
): void {
  useEffect(() => {
    if (!loadedRequest) return;
    const dueAt = Date.now() + delayMs;
    function refreshIfDue(): void {
      if (document.visibilityState === 'visible' && Date.now() >= dueAt) setRefreshCount((count) => count + 1);
    }
    const timer = setTimeout(refreshIfDue, delayMs);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [loadedRequest, delayMs, setRefreshCount]);
}

function isSameQuery(a: NearbyQuery | null, b: NearbyQuery | null): boolean {
  if (a === null || b === null) return a === b;
  return a.center[0] === b.center[0] && a.center[1] === b.center[1] && a.radiusMiles === b.radiusMiles;
}

function isSameRequest(a: NearbyRequest | null, b: NearbyRequest): boolean {
  return (
    a !== null && isSameQuery(a.query, b.query) && a.backDays === b.backDays && a.refreshCount === b.refreshCount
  );
}
