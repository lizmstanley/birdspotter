import { EBIRD_DATA_LIFETIME_MS } from '../../src/services/ebird.ts';

/** A failed fetch is most often a dropped signal, which comes back within minutes. */
export const RETRY_AFTER_ERROR_MS = 60 * 1000;

export interface FetchOutcome {
  readonly error: string | null;
  /** A rejected key fails the same way on every retry, so it waits a full refresh interval, not a minute. */
  readonly isKeyRejected: boolean;
  /** eBird could not be reached; the list holds a saved copy, or nothing. */
  readonly hasNoSignal: boolean;
}

function isRetrySoon(outcome: FetchOutcome): boolean {
  return outcome.hasNoSignal || (outcome.error !== null && !outcome.isKeyRejected);
}

/** @returns how long after a sightings fetch settles to fetch them again */
export function sightingsDelayMs(outcome: FetchOutcome, refreshMs: number): number {
  return isRetrySoon(outcome) ? RETRY_AFTER_ERROR_MS : refreshMs;
}

/**
 * Hotspots change rarely, so a loaded list waits for a new query or key.
 * @returns how long after a hotspots fetch settles to fetch them again, or null to wait
 */
export function hotspotsDelayMs(outcome: FetchOutcome, refreshMs: number): number | null {
  if (isRetrySoon(outcome)) return RETRY_AFTER_ERROR_MS;
  return outcome.isKeyRejected ? refreshMs : null;
}

/** @returns whether data eBird sent at `fetchedAt` may still be shown at `now`, under eBird's cache terms */
export function isWithinLifetime(fetchedAt: number | null, now: number): fetchedAt is number {
  return fetchedAt !== null && now - fetchedAt < EBIRD_DATA_LIFETIME_MS;
}

export interface Held<Data> {
  readonly data: Data;
  readonly fetchedAt: number | null;
}

/**
 * A dropped signal should not empty a list, but eBird's cache terms cap how long its data is shown, and data fetched
 * under a key eBird now rejects is not shown at all.
 * @returns the data held before a failed fetch, while within its lifetime, else null
 */
export function heldAfterFailure<Data>(
  last: Held<Data> | null,
  failedAt: number,
  isKeyRejected: boolean
): Held<Data> | null {
  if (isKeyRejected || last === null || !isWithinLifetime(last.fetchedAt, failedAt)) return null;
  return { data: last.data, fetchedAt: last.fetchedAt };
}

/**
 * A list is fetched again once its delay passes, or sooner when its data reaches the end of its lifetime, so data past
 * the lifetime is replaced or dropped.
 * @param delayMs from `sightingsDelayMs` or `hotspotsDelayMs`
 * @param fetchedAt when eBird sent the data held, or null when none is held
 * @returns when to fetch again, in epoch milliseconds, or null to wait for a new query or key
 */
export function fetchAgainAt(now: number, delayMs: number | null, fetchedAt: number | null): number | null {
  if (delayMs === null && fetchedAt === null) return null;
  const afterDelay = delayMs === null ? Infinity : now + delayMs;
  const atLifetimeEnd = fetchedAt === null ? Infinity : fetchedAt + EBIRD_DATA_LIFETIME_MS;
  return Math.min(afterDelay, atLifetimeEnd);
}
