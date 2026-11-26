import { describeError as describeBirdingError } from '@birdspotter/birding-core/describeError.ts';
import { EbirdKeyRejectedError, EbirdKeyUnsendableError } from '@birdspotter/birding-core/errors.ts';
import { AudubonRequestError, InvalidCoordinatesError } from './errors.ts';

export function describeError(err: unknown): string {
  if (err instanceof AudubonRequestError) return `${err.message} (HTTP ${err.status})`;
  if (err instanceof InvalidCoordinatesError && err.featureName) return `${err.message} (${err.featureName})`;
  if (err instanceof EbirdKeyRejectedError || err instanceof EbirdKeyUnsendableError) return `${err.message} Check the key on the Help & API Keys tab.`;
  return describeBirdingError(err);
}
