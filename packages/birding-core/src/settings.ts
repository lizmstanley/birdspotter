import { fromMiles, isDistanceUnit, toMiles, type DistanceUnit } from './distanceUnit.ts';
import { NEARBY_RADIUS_MILES } from './nearby.ts';
import type { KeyValueStorage } from './storage.ts';

export const REFRESH_MINUTE_CHOICES = [15, 30, 60, 120] as const;
export type RefreshMinutes = (typeof REFRESH_MINUTE_CHOICES)[number];

// eBird searches at most 50 km, about 31 miles, around a point. Each kilometer choice is the round value nearest a
// mile choice, so switching units moves a radius to its match and back.
export const RADIUS_CHOICES: Readonly<Record<DistanceUnit, readonly number[]>> = {
  mi: [2, 5, NEARBY_RADIUS_MILES, 10, 15, 25],
  km: [3, 8, 12, 16, 25, 40],
};

const DEFAULT_RADIUS: Readonly<Record<DistanceUnit, number>> = { mi: NEARBY_RADIUS_MILES, km: 12 };
const DEFAULT_REFRESH_MINUTES: RefreshMinutes = 30;
const DEFAULT_BACK_DAYS = 7;

// eBird returns sightings from at most 30 days back.
export const BACK_DAY_CHOICES: readonly number[] = Array.from({ length: 30 }, (_, index) => index + 1);

export interface BirdingSettings {
  /** How often the Sightings list checks eBird, and how old a saved eBird copy may be. */
  readonly refreshMinutes: RefreshMinutes;
  /** The unit every distance shows in. */
  readonly distanceUnit: DistanceUnit;
  /** How far around the person the lists look, in an app that shows the choice: one of the unit's radius choices. */
  readonly radius: number;
  /** How many days back the Sightings list and the Hotspots ranking go. */
  readonly backDays: number;
}

export function defaultSettings(distanceUnit: DistanceUnit): BirdingSettings {
  return {
    refreshMinutes: DEFAULT_REFRESH_MINUTES,
    distanceUnit,
    radius: DEFAULT_RADIUS[distanceUnit],
    backDays: DEFAULT_BACK_DAYS,
  };
}

function isRefreshMinutes(value: unknown): value is RefreshMinutes {
  return REFRESH_MINUTE_CHOICES.some((choice) => choice === value);
}

function isRadiusChoice(value: unknown, unit: DistanceUnit): value is number {
  return RADIUS_CHOICES[unit].some((choice) => choice === value);
}

function isBackDays(value: unknown): value is number {
  return BACK_DAY_CHOICES.some((choice) => choice === value);
}

function nearestRadius(radius: number, from: DistanceUnit, to: DistanceUnit): number {
  const target = fromMiles(toMiles(radius, from), to);
  const gap = (choice: number) => Math.abs(choice - target);
  return RADIUS_CHOICES[to].reduce((best, choice) => (gap(choice) < gap(best) ? choice : best));
}

// A radius counts only beside the unit it was saved with, so a lost or damaged unit never turns kilometers into
// miles. Settings saved before the unit existed hold the radius in miles as `radiusMiles`.
function readRadius(saved: object, unit: DistanceUnit): number {
  const savedUnit = 'distanceUnit' in saved ? saved.distanceUnit : null;
  const radius = 'radius' in saved ? saved.radius : null;
  if (savedUnit === unit && isRadiusChoice(radius, unit)) return radius;
  const radiusMiles = 'radiusMiles' in saved ? saved.radiusMiles : null;
  if (isRadiusChoice(radiusMiles, 'mi')) return nearestRadius(radiusMiles, 'mi', unit);
  return DEFAULT_RADIUS[unit];
}

/**
 * @param localeUnit the unit to use when none is saved
 * @returns the saved settings, with the default for any value that is missing, unreadable, or not a choice
 */
export function readSettings(
  storage: KeyValueStorage | null,
  storageKey: string,
  localeUnit: DistanceUnit
): BirdingSettings {
  let saved: unknown = null;
  try {
    saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
  } catch {
    return defaultSettings(localeUnit);
  }
  if (typeof saved !== 'object' || saved === null) return defaultSettings(localeUnit);
  const refreshMinutes = 'refreshMinutes' in saved ? saved.refreshMinutes : null;
  const savedUnit = 'distanceUnit' in saved ? saved.distanceUnit : null;
  const backDays = 'backDays' in saved ? saved.backDays : null;
  const distanceUnit = isDistanceUnit(savedUnit) ? savedUnit : localeUnit;
  return {
    refreshMinutes: isRefreshMinutes(refreshMinutes) ? refreshMinutes : DEFAULT_REFRESH_MINUTES,
    distanceUnit,
    radius: readRadius(saved, distanceUnit),
    backDays: isBackDays(backDays) ? backDays : DEFAULT_BACK_DAYS,
  };
}

/** @returns whether the settings were saved; when not, they last until the app closes */
export function writeSettings(storage: KeyValueStorage | null, storageKey: string, settings: BirdingSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** @returns the settings in the unit, with the radius moved to the nearest choice in it */
export function withDistanceUnit(settings: BirdingSettings, distanceUnit: DistanceUnit): BirdingSettings {
  return { ...settings, distanceUnit, radius: nearestRadius(settings.radius, settings.distanceUnit, distanceUnit) };
}

export function searchRadiusMiles(settings: BirdingSettings): number {
  return toMiles(settings.radius, settings.distanceUnit);
}

export function refreshIntervalText(minutes: RefreshMinutes): string {
  switch (minutes) {
    case 15:
      return 'every 15 minutes';
    case 30:
      return 'every half hour';
    case 60:
      return 'every hour';
    case 120:
      return 'every 2 hours';
    default: {
      const unhandled: never = minutes;
      return unhandled;
    }
  }
}

export function radiusText(radius: number, unit: DistanceUnit): string {
  return unit === 'km' ? `${radius} km` : `${radius} miles`;
}
