/** A failed fetch is most often a dropped signal, which comes back within minutes. */
export const RETRY_AFTER_ERROR_MS = 60 * 1000;

export interface FetchOutcome {
  readonly error: string | null;
  /** A rejected key fails the same way on every retry, so it waits a full refresh interval, not a minute. */
  readonly isKeyRejected: boolean;
}

/** @returns how long after a sightings fetch settles to fetch them again */
export function sightingsDelayMs(outcome: FetchOutcome, refreshMs: number): number {
  if (outcome.error === null || outcome.isKeyRejected) return refreshMs;
  return RETRY_AFTER_ERROR_MS;
}

/**
 * Hotspots change rarely, so a loaded list waits for a new query or key.
 * @returns how long after a hotspots fetch settles to fetch them again, or null to wait
 */
export function hotspotsDelayMs(outcome: FetchOutcome, refreshMs: number): number | null {
  if (outcome.error === null) return null;
  return outcome.isKeyRejected ? refreshMs : RETRY_AFTER_ERROR_MS;
}
