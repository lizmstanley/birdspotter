export function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

/** @returns the typed center, or null when either value is blank, not a number, or out of range */
export function parseCircleCenter(latText: string, lngText: string): { lat: number; lng: number } | null {
  if (!latText.trim() || !lngText.trim()) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  return isLatitude(lat) && isLongitude(lng) ? { lat, lng } : null;
}
