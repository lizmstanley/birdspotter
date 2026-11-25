import { describeError as describeBirdingError } from '@birdspotter/birding-core/describeError.ts';
import { AudubonRequestError, InvalidCoordinatesError } from './errors.ts';

export function describeError(err: unknown): string {
  if (err instanceof AudubonRequestError) return `${err.message} (HTTP ${err.status})`;
  if (err instanceof InvalidCoordinatesError && err.featureName) return `${err.message} (${err.featureName})`;
  return describeBirdingError(err);
}
