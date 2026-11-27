import { partyCodeLine, type PartyEffort } from '@birdspotter/cbc-manager/services/partyCode.ts';
import type { CountSession, TravelMode } from './countSession.ts';
import type { SessionTotals } from './sessionStretches.ts';

export type StoppedSession = CountSession & { readonly stopTime: number };

/** The count sheet's words for each mode. */
export const MODE_LABELS: Readonly<Record<TravelMode, string>> = { foot: 'By foot', car: 'By vehicle' };

export function formatDate(time: number): string {
  return new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatAmount(value: number): string {
  return value.toFixed(2);
}

/** A phone records one party. */
const PARTIES_PER_COUNT = 1;

function partyEffort(session: StoppedSession, totals: SessionTotals): PartyEffort {
  const { circleCode, areaCode } = session;
  return {
    partyId: session.partyId,
    area: circleCode && areaCode ? { circleCode, areaCode } : null,
    startTime: session.startTime,
    stopTime: session.stopTime,
    participants: session.participants,
    carHours: totals.carHours,
    footHours: totals.footHours,
    feederHours: session.feederHours,
    carMiles: totals.carMiles,
    footMiles: totals.footMiles,
  };
}

/** @returns the totals as plain text, with the count sheet's fields in its order, then the party code */
export function sessionSummaryText(session: StoppedSession, totals: SessionTotals): string {
  return [
    'Christmas Bird Count party effort',
    ...(session.areaCode ? [`Area #: ${session.areaCode}`] : []),
    ...(session.areaName ? [session.areaName] : []),
    `${formatDate(session.startTime)}, ${formatTime(session.startTime)} to ${formatTime(session.stopTime)}`,
    `Participants: ${session.participants}`,
    `Parties: ${PARTIES_PER_COUNT}`,
    `Hours by vehicle: ${formatAmount(totals.carHours)}`,
    `Hours by foot: ${formatAmount(totals.footHours)}`,
    `Hours feeder watching: ${formatAmount(session.feederHours)}`,
    `Miles by vehicle: ${formatAmount(totals.carMiles)}`,
    `Miles by foot: ${formatAmount(totals.footMiles)}`,
    ...(totals.gapMiles > 0 ? [gapNote(totals.gapMiles)] : []),
    partyCodeLine(partyEffort(session, totals)),
  ].join('\n');
}

export function gapNote(gapMiles: number): string {
  return `${formatAmount(gapMiles)} of these miles are straight lines across gaps in the route.`;
}
