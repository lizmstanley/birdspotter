import { decodeAreaLink, InvalidAreaLinkError, UnsupportedAreaLinkVersionError, type AreaLinkData } from '../../src/services/areaLink.ts';
import { describeError } from '../../src/services/describeError.ts';

export type AreaLinkRead =
  | { readonly status: 'read'; readonly payload: string; readonly data: AreaLinkData }
  | { readonly status: 'failed'; readonly message: string };

export const DAMAGED_LINK_MESSAGE =
  'This link or code is damaged or is not a Circle Scout area. Ask the compiler for a new one.';
export const NEWER_LINK_MESSAGE =
  'This area was made by a newer Circle Scout. Close and reopen Circle Scout to update it, then try again.';

const URLS_IN_TEXT = /https?:\/\/\S+/g;
const BARE_PAYLOAD = /^[A-Za-z0-9_-]+$/;
// A link ending a sentence or wrapped in <>, (), or quotes carries that punctuation; base64url never contains it.
const LEADING_PAYLOAD = /^[A-Za-z0-9_-]+/;

function linkPayload(link: string): string | null {
  if (!URL.canParse(link)) return null;
  return LEADING_PAYLOAD.exec(new URL(link).hash.slice(1))?.[0] ?? null;
}

/** @returns the text after `#` in the first link in `text` that has some, the text itself when it is a bare payload, or null */
export function payloadFromText(text: string): string | null {
  const trimmed = text.trim();
  const links = [...trimmed.matchAll(URLS_IN_TEXT)].map((match) => match[0]);
  if (links.length === 0) return BARE_PAYLOAD.test(trimmed) ? trimmed : null;
  for (const link of links) {
    const payload = linkPayload(link);
    if (payload !== null) return payload;
  }
  return null;
}

function describeReadError(err: unknown): string {
  if (err instanceof InvalidAreaLinkError) return DAMAGED_LINK_MESSAGE;
  if (err instanceof UnsupportedAreaLinkVersionError) return NEWER_LINK_MESSAGE;
  return describeError(err);
}

/** Reads an area from a pasted link, a scanned code, or a bare payload. */
export function readAreaLinkText(text: string): AreaLinkRead {
  const payload = payloadFromText(text);
  if (payload === null) return { status: 'failed', message: DAMAGED_LINK_MESSAGE };
  try {
    return { status: 'read', payload, data: decodeAreaLink(payload) };
  } catch (err) {
    return { status: 'failed', message: describeReadError(err) };
  }
}
