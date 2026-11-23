import { AudubonRequestError, EbirdRequestError, InvalidCoordinatesError } from './errors.ts';

export function describeError(err: unknown): string {
  if (err instanceof EbirdRequestError || err instanceof AudubonRequestError) {
    return `${err.message} (HTTP ${err.status})`;
  }
  if (err instanceof InvalidCoordinatesError && err.featureName) {
    return `${err.message} (${err.featureName})`;
  }
  return err instanceof Error ? err.message : String(err);
}
