import type { Party } from '../db/types.ts';
import {
  decodePartyCode,
  InvalidPartyCodeError,
  PARTY_CODE_LABEL,
  UnsupportedPartyCodeVersionError,
  type PartyEffort,
} from './partyCode.ts';
import { seasonOfCountDay } from './season.ts';

export type PastedPartyRead =
  | {
      readonly status: 'read';
      readonly effort: PartyEffort;
      /** The circle's own spelling of the code's area, or null when the compiler must pick one */
      readonly areaCode: string | null;
      /** The season the count's date falls in when the circle has it, or null when the compiler must pick one */
      readonly season: number | null;
    }
  | { readonly status: 'failed'; readonly message: string };

export const UNREADABLE_PARTY_MESSAGE =
  'This text has no party code the web app can read. Paste the whole message from CBC Scout.';
export const NEWER_PARTY_MESSAGE =
  'This party code was made by a newer CBC Scout. Reload the web app to update it, then paste again.';
export const SEVERAL_PARTIES_MESSAGE = 'This text has more than one party code. Paste one message at a time.';

const PARTY_CODE_LINE = new RegExp(`^[\\s>]*${PARTY_CODE_LABEL}\\s*:\\s*([A-Za-z0-9_-]+)\\s*$`, 'gim');

/** @returns each different payload on a `Party code:` line, in the order they appear */
export function partyCodesInText(text: string): string[] {
  return [...new Set([...text.matchAll(PARTY_CODE_LINE)].map((match) => match[1]))];
}

function sameCode(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function decode(payload: string): PartyEffort | { readonly message: string } {
  try {
    return decodePartyCode(payload);
  } catch (err) {
    if (err instanceof UnsupportedPartyCodeVersionError) return { message: NEWER_PARTY_MESSAGE };
    if (err instanceof InvalidPartyCodeError) return { message: UNREADABLE_PARTY_MESSAGE };
    throw err;
  }
}

/**
 * Reads one party from a pasted CBC Scout message, for the open circle.
 * @param areaCodes the open circle's area codes
 * @param seasons the seasons the open circle has
 */
export function readPastedParty(
  text: string,
  circleCode: string,
  areaCodes: readonly string[],
  seasons: readonly number[]
): PastedPartyRead {
  const payloads = partyCodesInText(text);
  if (payloads.length === 0) return { status: 'failed', message: UNREADABLE_PARTY_MESSAGE };
  if (payloads.length > 1) return { status: 'failed', message: SEVERAL_PARTIES_MESSAGE };

  const effort = decode(payloads[0]);
  if ('message' in effort) return { status: 'failed', ...effort };
  if (effort.area && !sameCode(effort.area.circleCode, circleCode)) {
    return {
      status: 'failed',
      message: `This party is for circle ${effort.area.circleCode}. Open that circle, then paste again.`,
    };
  }

  const codeArea = effort.area?.areaCode;
  const areaCode = codeArea === undefined ? null : (areaCodes.find((code) => sameCode(code, codeArea)) ?? null);
  const datedSeason = seasonOfCountDay(effort.startTime);
  const season = datedSeason !== null && seasons.includes(datedSeason) ? datedSeason : null;
  return { status: 'read', effort, areaCode, season };
}

/** @returns the party row for `effort`, filed under `areaCode` */
export function partyFromEffort(effort: PartyEffort, areaCode: string): Party {
  return {
    party_id: effort.partyId,
    area_code: areaCode,
    start_time: effort.startTime,
    stop_time: effort.stopTime,
    participants: effort.participants,
    car_hours: effort.carHours,
    foot_hours: effort.footHours,
    feeder_hours: effort.feederHours,
    car_miles: effort.carMiles,
    foot_miles: effort.footMiles,
  };
}
