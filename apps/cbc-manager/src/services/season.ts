const FIRST_PREPARATION_MONTH_INDEX = 8;
const WINDOW_START_MONTH_INDEX = 11;
const WINDOW_START_DAY = 14;
const WINDOW_END_MONTH_INDEX = 0;
const WINDOW_END_DAY = 5;

/**
 * A season is named for the year its count window opens (Dec 14 to Jan 5), and runs
 * for planning purposes from September of that year to the end of August after the count.
 * Results arrive for months, so the previous season stays current until September.
 */
export function seasonInPreparation(today: Date): number {
  const year = today.getFullYear();
  return today.getMonth() >= FIRST_PREPARATION_MONTH_INDEX ? year : year - 1;
}

/** @returns the first day of the Audubon count window for the season */
export function countWindowStart(season: number): Date {
  return new Date(season, WINDOW_START_MONTH_INDEX, WINDOW_START_DAY);
}

/** @returns the last day of the Audubon count window for the season */
export function countWindowEnd(season: number): Date {
  return new Date(season + 1, WINDOW_END_MONTH_INDEX, WINDOW_END_DAY);
}

/** @returns the season to offer a rollover to, or null when the circle is already on it */
export function seasonToRollOverTo(currentSeason: number | null, today: Date): number | null {
  if (currentSeason === null) return null;
  const target = seasonInPreparation(today);
  return target > currentSeason ? target : null;
}

/** @returns the season whose count window holds the local calendar day of `time`, or null when no window does */
export function seasonOfCountDay(time: number): number | null {
  const at = new Date(time);
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const season = day.getMonth() === WINDOW_START_MONTH_INDEX ? day.getFullYear() : day.getFullYear() - 1;
  return day >= countWindowStart(season) && day <= countWindowEnd(season) ? season : null;
}
