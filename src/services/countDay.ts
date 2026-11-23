/**
 * Parses a circle's count date. Accepts `YYYY-MM-DD` (Audubon page) and `M/D/YYYY` (older ArcGIS data).
 * @returns the local calendar date, or null when the text is empty or not a date
 */
export function parseCountDate(text: string | null | undefined): Date | null {
  const parts = yearMonthDay(text?.trim() ?? '');
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  // Rejects dates like 2026-02-31, which Date would roll into March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function yearMonthDay(text: string): [number, number, number] | null {
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return [Number(us[3]), Number(us[1]), Number(us[2])];
  return null;
}

/**
 * Results are due from count day on. With no usable count date, results count as due,
 * so the compiler is never told an area is fine when the date is simply missing.
 */
export function areResultsDue(countDate: string | null | undefined, now: Date = new Date()): boolean {
  const day = parseCountDate(countDate);
  if (!day) return true;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today >= day;
}
