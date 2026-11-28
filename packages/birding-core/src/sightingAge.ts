const AGE_FORMAT = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const OBS_DT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function calendarDaysBetween(earlier: Date, later: Date): number {
  const earlierDay = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const laterDay = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return (laterDay - earlierDay) / DAY_MS;
}

function daysAgoText(reportedOn: Date, now: Date): string {
  return AGE_FORMAT.format(-Math.max(0, calendarDaysBetween(reportedOn, now)), 'day');
}

function isRealDate(date: Date, year: number, month: number, day: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * How long ago eBird says a sighting was reported, such as "40 minutes ago", "yesterday", or "just now".
 * `obsDt` names no time zone, so it is read as the phone's local time: the place is near the phone in normal use.
 * @param obsDt eBird's "YYYY-MM-DD HH:mm", or "YYYY-MM-DD" for a checklist with no time
 * @returns null when `obsDt` is in neither form
 */
export function sightingAgeText(obsDt: string, now: Date): string | null {
  const match = OBS_DT_PATTERN.exec(obsDt);
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const reportedOn = new Date(year, month - 1, day);
  if (!isRealDate(reportedOn, year, month, day)) return null;
  if (match[4] === undefined) return daysAgoText(reportedOn, now);

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour >= HOURS_PER_DAY || minute >= MINUTES_PER_HOUR) return null;
  const reportedAt = new Date(year, month - 1, day, hour, minute);
  const minutes = Math.floor((now.getTime() - reportedAt.getTime()) / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < MINUTES_PER_HOUR) return AGE_FORMAT.format(-minutes, 'minute');
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  // A 25-hour fall-back day can hold a report 24 hours old on today's date.
  if (hours < HOURS_PER_DAY || calendarDaysBetween(reportedAt, now) === 0) return AGE_FORMAT.format(-hours, 'hour');
  return daysAgoText(reportedAt, now);
}
