import type { DistanceUnit } from '@birdspotter/birding-core/distanceUnit.ts';
import { readSettings, type BirdingSettings } from '@birdspotter/birding-core/settings.ts';
import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';

export interface ScoutSettings extends BirdingSettings {
  /** Buzz or beep when the counter crosses into or out of their area or the circle. */
  readonly isEdgeCueOn: boolean;
}

/** On, so a counter who never opens Settings still gets the cue. */
const DEFAULT_IS_EDGE_CUE_ON = true;

function readIsEdgeCueOn(storage: KeyValueStorage | null, storageKey: string): boolean {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(storageKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null || !('isEdgeCueOn' in saved)) return DEFAULT_IS_EDGE_CUE_ON;
    return typeof saved.isEdgeCueOn === 'boolean' ? saved.isEdgeCueOn : DEFAULT_IS_EDGE_CUE_ON;
  } catch {
    return DEFAULT_IS_EDGE_CUE_ON;
  }
}

/**
 * The core's settings and CBC Scout's own, saved together under one key; the core's `writeSettings` saves every field.
 * @param localeUnit the unit to use when none is saved
 * @returns the saved settings, with the default for any value that is missing or unreadable
 */
export function readScoutSettings(
  storage: KeyValueStorage | null,
  storageKey: string,
  localeUnit: DistanceUnit
): ScoutSettings {
  return { ...readSettings(storage, storageKey, localeUnit), isEdgeCueOn: readIsEdgeCueOn(storage, storageKey) };
}
