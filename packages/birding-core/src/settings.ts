import { NEARBY_RADIUS_MILES } from './nearby.ts';
import type { KeyValueStorage } from './storage.ts';

export const REFRESH_MINUTE_CHOICES = [15, 30, 60, 120] as const;
export type RefreshMinutes = (typeof REFRESH_MINUTE_CHOICES)[number];

// eBird searches at most 50 km, about 31 miles, around a point.
export const RADIUS_MILE_CHOICES = [2, 5, NEARBY_RADIUS_MILES, 10, 15, 25] as const;
export type RadiusMiles = (typeof RADIUS_MILE_CHOICES)[number];

export interface BirdingSettings {
  /** How often the Sightings list checks eBird, and how old a saved eBird copy may be. */
  readonly refreshMinutes: RefreshMinutes;
  /** How far around the person the lists look, in an app that shows the choice. */
  readonly radiusMiles: RadiusMiles;
}

export const DEFAULT_SETTINGS: BirdingSettings = { refreshMinutes: 30, radiusMiles: NEARBY_RADIUS_MILES };

function isRefreshMinutes(value: unknown): value is RefreshMinutes {
  return REFRESH_MINUTE_CHOICES.some((choice) => choice === value);
}

function isRadiusMiles(value: unknown): value is RadiusMiles {
  return RADIUS_MILE_CHOICES.some((choice) => choice === value);
}

/** @returns the saved settings, with the default for any value that is missing, unreadable, or not a choice */
export function readSettings(storage: KeyValueStorage | null, storageKey: string): BirdingSettings {
  let saved: unknown = null;
  try {
    saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof saved !== 'object' || saved === null) return DEFAULT_SETTINGS;
  const refreshMinutes = 'refreshMinutes' in saved ? saved.refreshMinutes : null;
  const radiusMiles = 'radiusMiles' in saved ? saved.radiusMiles : null;
  return {
    refreshMinutes: isRefreshMinutes(refreshMinutes) ? refreshMinutes : DEFAULT_SETTINGS.refreshMinutes,
    radiusMiles: isRadiusMiles(radiusMiles) ? radiusMiles : DEFAULT_SETTINGS.radiusMiles,
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

export function radiusText(miles: RadiusMiles): string {
  return `${miles} miles`;
}
