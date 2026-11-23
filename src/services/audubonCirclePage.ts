/**
 * Reads circle details (count date, visible compiler, center) from the public Audubon
 * circle page, https://cbc.audubon.org/en/join/circles/<CODE>.
 * The page is a Next.js app; its data sits in `self.__next_f.push([1, "..."])` script chunks.
 */

export interface AudubonCircleDetails {
  readonly code: string;
  readonly name: string;
  readonly stateProvince: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly countDate: string | null;
  readonly compilerName: string | null;
  readonly compilerEmail: string | null;
  readonly pageUrl: string;
}

const CIRCLE_CODE = /^[A-Z0-9]{2,8}$/;
const FETCH_TIMEOUT_MS = 10_000;

export function audubonCirclePageUrl(code: string): string {
  return `https://cbc.audubon.org/en/join/circles/${code}`;
}

/**
 * @returns the circle's details, or null when the code is malformed or the page has no such circle
 * @throws when the request fails or times out
 */
export async function fetchAudubonCircleDetails(code: string): Promise<AudubonCircleDetails | null> {
  const normalized = code.trim().toUpperCase();
  if (!CIRCLE_CODE.test(normalized)) return null;
  const res = await fetch(`/audubon-cbc/en/join/circles/${normalized}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return parseAudubonCirclePage(await res.text(), normalized);
}

export function parseAudubonCirclePage(html: string, code: string): AudubonCircleDetails | null {
  const flight = decodeFlightData(html);
  for (const candidate of circleObjectCandidates(flight)) {
    const details = readCircle(candidate, code);
    if (details) return details;
  }
  return null;
}

function decodeFlightData(html: string): string {
  const pushes = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g);
  let flight = '';
  for (const match of pushes) {
    const decoded: unknown = JSON.parse(match[1]);
    if (typeof decoded === 'string') flight += decoded;
  }
  return flight;
}

function* circleObjectCandidates(flight: string): Generator<unknown> {
  const marker = '"circle":{';
  for (let at = flight.indexOf(marker); at >= 0; at = flight.indexOf(marker, at + 1)) {
    const json = balancedObjectAt(flight, at + marker.length - 1);
    if (!json) continue;
    try {
      yield JSON.parse(json) as unknown;
    } catch {
      // Not valid JSON on its own (for example a "$" reference); try the next occurrence.
    }
  }
}

/** Returns the `{...}` text starting at `start`, skipping braces inside strings. */
function balancedObjectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function readCircle(value: unknown, code: string): AudubonCircleDetails | null {
  if (!isRecord(value) || value.abbreviation !== code) return null;
  const position = value.position;
  if (!isRecord(position)) return null;
  const lat = position.latitude;
  const lng = position.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const leader = Array.isArray(value.leaders)
    ? value.leaders.find((l): l is Record<string, unknown> => isRecord(l) && l.isVisibleLeader === true)
    : undefined;

  return {
    code,
    name: stringOrNull(value.circleName) ?? code,
    stateProvince: stringOrNull(value.stateProvinceId),
    lat,
    lng,
    countDate: stringOrNull(value.countDate),
    compilerName: stringOrNull(leader?.fullName),
    compilerEmail: stringOrNull(leader?.email),
    pageUrl: audubonCirclePageUrl(code),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
