export const FETCH_TIMEOUT_MS = 10_000;

/** True for the errors `fetch` and `Response.json` raise when the network, the timeout, or the body fails. */
export function isRequestFailure(err: unknown): boolean {
  if (err instanceof TypeError || err instanceof SyntaxError) return true;
  return err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
