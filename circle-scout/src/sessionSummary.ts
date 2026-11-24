import type { CountSession, TravelMode } from './countSession.ts';
import type { SessionTotals } from './sessionStretches.ts';

export type StoppedSession = CountSession & { readonly stopTime: number };

export const MODE_LABELS: Readonly<Record<TravelMode, string>> = { foot: 'On foot', car: 'By car' };

export function formatDate(time: number): string {
  return new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatAmount(value: number): string {
  return value.toFixed(2);
}

/** @returns the totals as plain text in the shape the CBC results ask for */
export function sessionSummaryText(session: StoppedSession, totals: SessionTotals): string {
  return [
    'Christmas Bird Count party effort',
    ...(session.areaName ? [session.areaName] : []),
    `${formatDate(session.startTime)}, ${formatTime(session.startTime)} to ${formatTime(session.stopTime)}`,
    `Total: ${formatAmount(totals.totalHours)} hours`,
    `${MODE_LABELS.foot}: ${formatAmount(totals.footHours)} hours, ${formatAmount(totals.footMiles)} miles`,
    `${MODE_LABELS.car}: ${formatAmount(totals.carHours)} hours, ${formatAmount(totals.carMiles)} miles`,
    `Miles from gaps in the route (straight line): ${formatAmount(totals.gapMiles)}`,
  ].join('\n');
}
