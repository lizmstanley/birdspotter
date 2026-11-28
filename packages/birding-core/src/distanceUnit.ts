export const DISTANCE_UNITS = ['mi', 'km'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const KM_PER_MILE = 1.609344;

/** The unit's name in running text, as in "hours and kilometers". */
export const DISTANCE_UNIT_NAMES: Readonly<Record<DistanceUnit, string>> = { mi: 'miles', km: 'kilometers' };

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return DISTANCE_UNITS.some((unit) => unit === value);
}

/** @returns the distance in the unit, from miles, the unit the apps compute in */
export function fromMiles(miles: number, unit: DistanceUnit): number {
  return unit === 'km' ? miles * KM_PER_MILE : miles;
}

export function toMiles(distance: number, unit: DistanceUnit): number {
  return unit === 'km' ? distance / KM_PER_MILE : distance;
}

/**
 * @param languageTag a BCP 47 tag, such as `navigator.language`
 * @returns miles when the locale's likely region is the US, else kilometers; miles for a tag that cannot be read
 */
export function localeDistanceUnit(languageTag: string): DistanceUnit {
  let region: string | undefined;
  try {
    region = new Intl.Locale(languageTag).maximize().region;
  } catch {
    return 'mi';
  }
  return region === undefined || region === 'US' ? 'mi' : 'km';
}
