import type { LocationFix } from '../countSession.ts';

export const START_TIME = Date.UTC(2026, 11, 19, 13, 0);
export const MINUTE_MS = 60_000;
const ORIGIN_LNG = -93.25;
const ORIGIN_LAT = 44.95;
const METERS_PER_DEGREE_LAT = 111_194.93;

/** A fix the given meters north of a fixed origin, the given minutes after START_TIME. */
export function fixAt(metersNorth: number, minutes: number, accuracy = 10): LocationFix {
  return {
    lng: ORIGIN_LNG,
    lat: ORIGIN_LAT + metersNorth / METERS_PER_DEGREE_LAT,
    time: START_TIME + minutes * MINUTE_MS,
    accuracy,
  };
}
