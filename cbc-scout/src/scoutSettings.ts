import type { AreaStorage } from './savedAreas.ts';

export const SETTINGS_STORAGE_KEY = 'cbc_scout_settings';

export const REFRESH_MINUTE_CHOICES = [15, 30, 60, 120] as const;
export type RefreshMinutes = (typeof REFRESH_MINUTE_CHOICES)[number];

export interface ScoutSettings {
  /** How often the Nearby list checks eBird, and how old a saved eBird copy may be. */
  readonly refreshMinutes: RefreshMinutes;
}

export const DEFAULT_SETTINGS: ScoutSettings = { refreshMinutes: 30 };

function isRefreshMinutes(value: unknown): value is RefreshMinutes {
  return REFRESH_MINUTE_CHOICES.some((choice) => choice === value);
}

/** @returns the saved settings, with the default for any value that is missing, unreadable, or not a choice */
export function readScoutSettings(storage: AreaStorage | null): ScoutSettings {
  let saved: unknown = null;
  try {
    saved = JSON.parse(storage?.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
  } catch {
    return DEFAULT_SETTINGS;
  }
  const refreshMinutes = typeof saved === 'object' && saved !== null && 'refreshMinutes' in saved ? saved.refreshMinutes : null;
  return { refreshMinutes: isRefreshMinutes(refreshMinutes) ? refreshMinutes : DEFAULT_SETTINGS.refreshMinutes };
}

/** @returns whether the settings were saved; when not, they last until the app closes */
export function writeScoutSettings(storage: AreaStorage | null, settings: ScoutSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
