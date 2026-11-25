import { EbirdRequestError } from './errors.ts';

export function describeError(err: unknown): string {
  if (err instanceof EbirdRequestError) return `${err.message} (HTTP ${err.status})`;
  return err instanceof Error ? err.message : String(err);
}
