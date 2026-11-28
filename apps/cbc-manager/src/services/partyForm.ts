import type { Party } from '../db/types.ts';
import { isoDay } from './countDay.ts';

/** What the compiler types for one party. Times are local; blank hours and miles mean none. */
export interface PartyFormValues {
  readonly date: string;
  readonly startTime: string;
  readonly stopTime: string;
  readonly participants: string;
  readonly carHours: string;
  readonly footHours: string;
  readonly feederHours: string;
  readonly carMiles: string;
  readonly footMiles: string;
}

export type PartyFormResult = { readonly party: Party } | { readonly problem: string };

// The parties table's NUMERIC(7, 2) and INTEGER columns.
const MAX_AMOUNT = 99999.99;
const MAX_PARTICIPANTS = 2_147_483_647;

/** @returns the form for a new party on `date`, or for editing `party` */
export function partyFormValues(party: Party | null, date: string): PartyFormValues {
  if (!party) {
    return {
      date,
      startTime: '',
      stopTime: '',
      participants: '1',
      carHours: '',
      footHours: '',
      feederHours: '',
      carMiles: '',
      footMiles: '',
    };
  }
  return {
    date: isoDay(new Date(party.start_time)),
    startTime: clockTime(party.start_time),
    stopTime: clockTime(party.stop_time),
    participants: String(party.participants),
    carHours: String(party.car_hours),
    footHours: String(party.foot_hours),
    feederHours: String(party.feeder_hours),
    carMiles: String(party.car_miles),
    footMiles: String(party.foot_miles),
  };
}

/** @returns local `HH:MM` */
export function clockTime(time: number): string {
  const at = new Date(time);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

function localTime(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = new Date(`${date}T${time}`).getTime();
  return Number.isNaN(at) ? null : at;
}

function amount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT ? value : null;
}

/** @returns the party to save, or what the compiler must fix first */
export function partyFromForm(values: PartyFormValues, partyId: string, areaCode: string): PartyFormResult {
  const startTime = localTime(values.date, values.startTime);
  const stopTime = localTime(values.date, values.stopTime);
  if (startTime === null || stopTime === null) return { problem: 'Enter the date and the start and stop times.' };
  if (stopTime < startTime) return { problem: 'The stop time is before the start time.' };

  const participants = Number(values.participants.trim());
  if (!Number.isInteger(participants) || participants < 1 || participants > MAX_PARTICIPANTS) {
    return { problem: 'Participants must be a whole number, 1 or more.' };
  }

  const carHours = amount(values.carHours);
  const footHours = amount(values.footHours);
  const feederHours = amount(values.feederHours);
  const carMiles = amount(values.carMiles);
  const footMiles = amount(values.footMiles);
  if (carHours === null || footHours === null || feederHours === null || carMiles === null || footMiles === null) {
    return { problem: 'Hours and miles must be numbers from 0 to 99999.99.' };
  }

  return {
    party: {
      party_id: partyId,
      area_code: areaCode,
      start_time: startTime,
      stop_time: stopTime,
      participants,
      car_hours: carHours,
      foot_hours: footHours,
      feeder_hours: feederHours,
      car_miles: carMiles,
      foot_miles: footMiles,
    },
  };
}
