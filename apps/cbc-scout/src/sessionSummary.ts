import { partyCodeLine, type PartyEffort } from '@birdspotter/cbc-manager/services/partyCode.ts';
import { DISTANCE_UNIT_NAMES, fromMiles, type DistanceUnit } from '@birdspotter/birding-core/distanceUnit.ts';
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

/** The count sheet's word for the unit, at the start of a line or a column. */
export const DISTANCE_LABELS: Readonly<Record<DistanceUnit, string>> = { mi: 'Miles', km: 'Km' };

export function formatDistanceAmount(miles: number, unit: DistanceUnit): string {
  return formatAmount(fromMiles(miles, unit));
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
    route: session.tracks.map((track) => track.map((point) => [point.lng, point.lat])),
  };
}

/**
 * @param unit the unit the distance lines show and name; the party code carries miles whatever the unit
 * @returns the totals as plain text, with the count sheet's fields in its order, then the party code
 */
export function sessionSummaryText(session: StoppedSession, totals: SessionTotals, unit: DistanceUnit): string {
  const label = DISTANCE_LABELS[unit];
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
    `${label} by vehicle: ${formatDistanceAmount(totals.carMiles, unit)}`,
    `${label} by foot: ${formatDistanceAmount(totals.footMiles, unit)}`,
    ...(totals.gapMiles > 0 ? [gapNote(totals.gapMiles, unit)] : []),
    partyCodeLine(partyEffort(session, totals)),
  ].join('\n');
}

export function gapNote(gapMiles: number, unit: DistanceUnit): string {
  const amount = formatDistanceAmount(gapMiles, unit);
  return `${amount} of these ${DISTANCE_UNIT_NAMES[unit]} are straight lines across gaps in the route.`;
}
