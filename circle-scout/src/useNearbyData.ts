import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import { describeError } from '../../src/services/describeError.ts';
import { EbirdKeyRejectedError } from '../../src/services/errors.ts';
import {
  fetchHotspotsInCircle,
  fetchRecentNotableSightingsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdObservation,
} from '../../src/services/ebird.ts';
import { nearbyQuery, type LngLat, type NearbyQuery } from './nearby.ts';
import { hotspotsDelayMs, sightingsDelayMs, type FetchOutcome } from './nearbyRefresh.ts';

interface ListRequest {
  readonly query: NearbyQuery;
  /** Changes each time the list is due again, so the same query is fetched again. */
  readonly fetchCount: number;
}

interface SightingsRequest extends ListRequest {
  readonly backDays: number;
}

interface Sightings {
  readonly regular: readonly EbirdObservation[];
  readonly notable: readonly EbirdObservation[];
}

export interface NearbyData extends Sightings {
  readonly hotspots: readonly EbirdHotspot[];
  readonly error: string | null;
  readonly isKeyRejected: boolean;
  readonly isLoading: boolean;
}

interface Loaded<Request, Data> extends FetchOutcome {
  readonly request: Request;
  readonly data: Data;
}

const NO_OUTCOME: FetchOutcome = { error: null, isKeyRejected: false };
const NO_SIGHTINGS: Sightings = { regular: [], notable: [] };
const NO_HOTSPOTS: readonly EbirdHotspot[] = [];

/**
 * Fetches the eBird data for the Nearby and Suggestions lists, nothing while the key is empty. Regular and notable sightings are fetched together, and again at each
 * interval while the page is shown; hotspots change rarely, so they use any copy saved today and are fetched again
 * only for a new query or key, or after a failure.
 * @param refreshMs both the sightings refresh interval and their saved-copy age limit. A copy just short of this age
 *   when the list loads is replaced at the next refresh, so the sightings shown are never twice this old.
 */
export function useNearbyData(
  apiKey: string,
  area: AreaLinkData | null,
  position: LngLat | null,
  backDays: number,
  refreshMs: number
): NearbyData {
  const [query, setQuery] = useState<NearbyQuery | null>(null);
  const [sightingsFetchCount, setSightingsFetchCount] = useState(0);
  const [hotspotsFetchCount, setHotspotsFetchCount] = useState(0);
  const [sightings, setSightings] = useState<Loaded<SightingsRequest, Sightings> | null>(null);
  const [hotspots, setHotspots] = useState<Loaded<ListRequest, readonly EbirdHotspot[]> | null>(null);

  const nextQuery = apiKey ? nearbyQuery(area, position, query) : null;
  // Kept in state so it moves only when nearbyQuery moves it, not on every location fix.
  if (nextQuery !== query && !isSameQuery(nextQuery, query)) setQuery(nextQuery);

  const [lng, lat] = query?.center ?? [0, 0];
  const radiusMiles = query?.radiusMiles ?? 0;
  const hasQuery = query !== null;

  useEffect(() => {
    if (!hasQuery) return;
    const request = { query: { center: [lng, lat] as const, radiusMiles }, fetchCount: hotspotsFetchCount };
    return loadInto(setHotspots, request, fetchHotspotsInCircle(apiKey, lat, lng, radiusMiles), NO_HOTSPOTS);
  }, [apiKey, hasQuery, lng, lat, radiusMiles, hotspotsFetchCount]);

  useEffect(() => {
    if (!hasQuery) return;
    const request = { query: { center: [lng, lat] as const, radiusMiles }, backDays, fetchCount: sightingsFetchCount };
    const fetched = Promise.all([
      fetchRecentSightingsInCircle(apiKey, lat, lng, radiusMiles, backDays, refreshMs),
      fetchRecentNotableSightingsInCircle(apiKey, lat, lng, radiusMiles, backDays, refreshMs),
    ]).then(([regular, notable]) => ({ regular, notable }));
    return loadInto(setSightings, request, fetched, NO_SIGHTINGS);
  }, [apiKey, hasQuery, lng, lat, radiusMiles, backDays, sightingsFetchCount, refreshMs]);

  const sightingsOutcome = sightings ?? NO_OUTCOME;
  const hotspotsOutcome = hotspots ?? NO_OUTCOME;
  const sightingsDelay = sightingsDelayMs(sightingsOutcome, refreshMs);
  const hotspotsDelay = hotspotsDelayMs(hotspotsOutcome, refreshMs);
  useFetchAgainWhileShown(sightings?.request ?? null, sightingsDelay, setSightingsFetchCount);
  useFetchAgainWhileShown(hotspots?.request ?? null, hotspotsDelay, setHotspotsFetchCount);

  const isSightingsLoaded =
    isLoadedFor(sightings?.request ?? null, query, sightingsFetchCount) && sightings?.request.backDays === backDays;
  const isHotspotsLoaded = isLoadedFor(hotspots?.request ?? null, query, hotspotsFetchCount);
  return {
    hotspots: hotspots?.data ?? NO_HOTSPOTS,
    ...(sightings?.data ?? NO_SIGHTINGS),
    error: sightingsOutcome.error ?? hotspotsOutcome.error,
    isKeyRejected: sightingsOutcome.isKeyRejected || hotspotsOutcome.isKeyRejected,
    isLoading: query !== null && !(isSightingsLoaded && isHotspotsLoaded),
  };
}

/**
 * Stores what a fetch settles to, unless the effect that started it is cleaned up first.
 * @returns the effect cleanup
 */
function loadInto<Request, Data>(
  setLoaded: Dispatch<SetStateAction<Loaded<Request, Data> | null>>,
  request: Request,
  fetched: Promise<Data>,
  empty: Data
): () => void {
  let isCurrent = true;
  fetched
    .then((data) => {
      if (isCurrent) setLoaded({ request, data, error: null, isKeyRejected: false });
    })
    .catch((err: unknown) => {
      if (!isCurrent) return;
      // The last rows stay up, so a dropped signal does not empty the list.
      setLoaded((last) => ({
        request,
        data: last?.data ?? empty,
        error: describeError(err),
        isKeyRejected: err instanceof EbirdKeyRejectedError,
      }));
    });
  return () => {
    isCurrent = false;
  };
}

/**
 * Counts up a while after each load, or when the page is next shown if it was hidden then.
 * A phone can pause timers while the page is hidden, so the visibility check covers a timer that never fired.
 * @param delayMs how long after the load to count up; null to wait for a new load
 */
function useFetchAgainWhileShown(
  loadedRequest: object | null,
  delayMs: number | null,
  setFetchCount: Dispatch<SetStateAction<number>>
): void {
  useEffect(() => {
    if (!loadedRequest || delayMs === null) return;
    const dueAt = Date.now() + delayMs;
    function fetchAgainIfDue(): void {
      if (document.visibilityState === 'visible' && Date.now() >= dueAt) setFetchCount((count) => count + 1);
    }
    const timer = setTimeout(fetchAgainIfDue, delayMs);
    document.addEventListener('visibilitychange', fetchAgainIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', fetchAgainIfDue);
    };
  }, [loadedRequest, delayMs, setFetchCount]);
}

function isSameQuery(a: NearbyQuery | null, b: NearbyQuery | null): boolean {
  if (a === null || b === null) return a === b;
  return a.center[0] === b.center[0] && a.center[1] === b.center[1] && a.radiusMiles === b.radiusMiles;
}

function isLoadedFor(loaded: ListRequest | null, query: NearbyQuery | null, fetchCount: number): boolean {
  return loaded !== null && isSameQuery(loaded.query, query) && loaded.fetchCount === fetchCount;
}
