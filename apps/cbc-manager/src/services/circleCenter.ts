import { isLatitude, isLongitude } from '@birdspotter/birding-core/coordinates.ts';

/** @returns the typed center, or null when either value is blank, not a number, or out of range */
export function parseCircleCenter(latText: string, lngText: string): { lat: number; lng: number } | null {
  if (!latText.trim() || !lngText.trim()) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  return isLatitude(lat) && isLongitude(lng) ? { lat, lng } : null;
}
