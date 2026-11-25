import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { describeError } from './describeError.ts';
import { EbirdKeyRejectedError, EbirdUnreachableError } from './errors.ts';
import {
  EBIRD_DATA_LIFETIME_MS,
  fetchHotspotsInCircle,
  fetchRecentNotableSightingsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdList,
  type EbirdObservation,
} from './ebird.ts';
import { nearbyQuery, type LngLat, type NearbyQuery } from './nearby.ts';
import {
  fetchAgainAt,
  heldAfterFailure,
  hotspotsDelayMs,
  sightingsDelayMs,
  type FetchOutcome,
} from './nearbyRefresh.ts';

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
  /** eBird could not be reached at the last fetch of either list. */
  readonly hasNoSignal: boolean;
  /** When eBird sent the sightings shown, in epoch milliseconds, or null when none are held. */
  readonly sightingsFetchedAt: number | null;
  /** When eBird sent the hotspots shown, in epoch milliseconds, or null when none are held. */
  readonly hotspotsFetchedAt: number | null;
}

interface Fetched<Data> {
  readonly data: Data;
  readonly fetchedAt: number;
  readonly hasNoSignal: boolean;
}

interface Loaded<Request, Data> extends FetchOutcome {
  readonly request: Request;
  readonly data: Data;
  readonly fetchedAt: number | null;
}

const NO_OUTCOME: FetchOutcome = { error: null, isKeyRejected: false, hasNoSignal: false };
const NO_SIGHTINGS: Sightings = { regular: [], notable: [] };
const NO_HOTSPOTS: readonly EbirdHotspot[] = [];

/**
 * Fetches the eBird data for the Nearby and Suggestions lists, nothing while the key is empty. Regular and notable sightings are fetched together, and again at each
 * interval while the page is shown; hotspots change rarely, so they use a copy saved in the last 6 hours and are
 * fetched again only for a new query or key, after a failure, or when 6 hours old. With no signal, each list shows a
 * saved copy or the last data it held, until that data is 6 hours old.
 * @param pinnedQuery the search the app holds in place, or null to search around the person
 * @param searchRadiusMiles how far around the person to search when nothing is pinned
 * @param refreshMs both the sightings refresh interval and their saved-copy age limit. A copy just short of this age
 *   when the list loads is replaced at the next refresh, so the sightings shown are never twice this old.
 */
export function useNearbyData(
  apiKey: string,
  pinnedQuery: NearbyQuery | null,
  position: LngLat | null,
  searchRadiusMiles: number,
  backDays: number,
  refreshMs: number
): NearbyData {
  const [query, setQuery] = useState<NearbyQuery | null>(null);
  const [sightingsFetchCount, setSightingsFetchCount] = useState(0);
  const [hotspotsFetchCount, setHotspotsFetchCount] = useState(0);
  const [sightings, setSightings] = useState<Loaded<SightingsRequest, Sightings> | null>(null);
  const [hotspots, setHotspots] = useState<Loaded<ListRequest, readonly EbirdHotspot[]> | null>(null);

  const nextQuery = apiKey ? nearbyQuery(pinnedQuery, position, query, searchRadiusMiles) : null;
  // Kept in state so it moves only when nearbyQuery moves it, not on every location fix.
  if (nextQuery !== query && !isSameQuery(nextQuery, query)) setQuery(nextQuery);

  const [lng, lat] = query?.center ?? [0, 0];
  const radiusMiles = query?.radiusMiles ?? 0;
  const hasQuery = query !== null;

  useEffect(() => {
    if (!hasQuery) return;
    const request = { query: { center: [lng, lat] as const, radiusMiles }, fetchCount: hotspotsFetchCount };
    const fetched = fetchHotspotsInCircle(apiKey, lat, lng, radiusMiles, EBIRD_DATA_LIFETIME_MS).then(fromList);
    return loadInto(setHotspots, request, fetched, NO_HOTSPOTS);
  }, [apiKey, hasQuery, lng, lat, radiusMiles, hotspotsFetchCount]);

  useEffect(() => {
    if (!hasQuery) return;
    const request = { query: { center: [lng, lat] as const, radiusMiles }, backDays, fetchCount: sightingsFetchCount };
    const fetched = Promise.all([
      fetchRecentSightingsInCircle(apiKey, lat, lng, radiusMiles, backDays, refreshMs),
      fetchRecentNotableSightingsInCircle(apiKey, lat, lng, radiusMiles, backDays, refreshMs),
    ]).then(([regular, notable]) => ({
      data: { regular: regular.items, notable: notable.items },
      fetchedAt: Math.min(regular.fetchedAt, notable.fetchedAt),
      hasNoSignal: regular.isNoSignalCopy || notable.isNoSignalCopy,
    }));
    return loadInto(setSightings, request, fetched, NO_SIGHTINGS);
  }, [apiKey, hasQuery, lng, lat, radiusMiles, backDays, sightingsFetchCount, refreshMs]);

  const sightingsOutcome = sightings ?? NO_OUTCOME;
  const hotspotsOutcome = hotspots ?? NO_OUTCOME;
  const sightingsDelay = sightingsDelayMs(sightingsOutcome, refreshMs);
  const hotspotsDelay = hotspotsDelayMs(hotspotsOutcome, refreshMs);
  useFetchAgainWhileShown(sightings, sightingsDelay, setSightingsFetchCount);
  useFetchAgainWhileShown(hotspots, hotspotsDelay, setHotspotsFetchCount);

  const isSightingsLoaded =
    isLoadedFor(sightings?.request ?? null, query, sightingsFetchCount) && sightings?.request.backDays === backDays;
  const isHotspotsLoaded = isLoadedFor(hotspots?.request ?? null, query, hotspotsFetchCount);
  return {
    hotspots: hotspots?.data ?? NO_HOTSPOTS,
    ...(sightings?.data ?? NO_SIGHTINGS),
    error: shownError(sightingsOutcome) ?? shownError(hotspotsOutcome),
    isKeyRejected: sightingsOutcome.isKeyRejected || hotspotsOutcome.isKeyRejected,
    isLoading: query !== null && !(isSightingsLoaded && isHotspotsLoaded),
    hasNoSignal: sightingsOutcome.hasNoSignal || hotspotsOutcome.hasNoSignal,
    sightingsFetchedAt: sightings?.fetchedAt ?? null,
    hotspotsFetchedAt: hotspots?.fetchedAt ?? null,
  };
}

function fromList<T>(list: EbirdList<T>): Fetched<readonly T[]> {
  return { data: list.items, fetchedAt: list.fetchedAt, hasNoSignal: list.isNoSignalCopy };
}

/** No signal has its own notice, so its error text is not shown. */
function shownError(outcome: FetchOutcome): string | null {
  return outcome.hasNoSignal ? null : outcome.error;
}

/**
 * Stores what a fetch settles to, unless the effect that started it is cleaned up first.
 * @returns the effect cleanup
 */
function loadInto<Request, Data>(
  setLoaded: Dispatch<SetStateAction<Loaded<Request, Data> | null>>,
  request: Request,
  fetched: Promise<Fetched<Data>>,
  empty: Data
): () => void {
  let isCurrent = true;
  fetched
    .then(({ data, fetchedAt, hasNoSignal }) => {
      if (isCurrent) setLoaded({ request, data, fetchedAt, hasNoSignal, error: null, isKeyRejected: false });
    })
    .catch((err: unknown) => {
      if (!isCurrent) return;
      const failedAt = Date.now();
      const isKeyRejected = err instanceof EbirdKeyRejectedError;
      setLoaded((last) => ({
        request,
        ...(heldAfterFailure(last, failedAt, isKeyRejected) ?? { data: empty, fetchedAt: null }),
        error: describeError(err),
        isKeyRejected,
        hasNoSignal: err instanceof EbirdUnreachableError,
      }));
    });
  return () => {
    isCurrent = false;
  };
}

/**
 * Counts up a while after each load, or once the data loaded reaches eBird's cache limit, or when the page is next
 * shown if it was hidden then. A phone can pause timers while the page is hidden, so the visibility check covers a
 * timer that never fired.
 * @param delayMs how long after the load to count up; null to wait for a new load or the cache limit
 */
function useFetchAgainWhileShown(
  loaded: { readonly request: object; readonly fetchedAt: number | null } | null,
  delayMs: number | null,
  setFetchCount: Dispatch<SetStateAction<number>>
): void {
  const loadedRequest = loaded?.request ?? null;
  const fetchedAt = loaded?.fetchedAt ?? null;
  useEffect(() => {
    if (!loadedRequest) return;
    const dueAt = fetchAgainAt(Date.now(), delayMs, fetchedAt);
    if (dueAt === null) return;
    const fetchAgainIfDue = (): void => {
      if (document.visibilityState === 'visible' && Date.now() >= dueAt) setFetchCount((count) => count + 1);
    };
    const timer = setTimeout(fetchAgainIfDue, Math.max(0, dueAt - Date.now()));
    document.addEventListener('visibilitychange', fetchAgainIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', fetchAgainIfDue);
    };
  }, [loadedRequest, fetchedAt, delayMs, setFetchCount]);
}

function isSameQuery(a: NearbyQuery | null, b: NearbyQuery | null): boolean {
  if (a === null || b === null) return a === b;
  return a.center[0] === b.center[0] && a.center[1] === b.center[1] && a.radiusMiles === b.radiusMiles;
}

function isLoadedFor(loaded: ListRequest | null, query: NearbyQuery | null, fetchCount: number): boolean {
  return loaded !== null && isSameQuery(loaded.query, query) && loaded.fetchCount === fetchCount;
}
