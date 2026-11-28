import type { Feature, Polygon } from 'geojson';
import type { GeolocateControl, GeolocatePositionEvent } from 'maplibre-gl';
import type { AreaLinkData } from '@birdspotter/cbc-manager/services/areaLink.ts';
import { metersToNearestEdge } from './areaEdge.ts';
import { areaStatusAt, type AreaStatus } from './areaStatus.ts';
import { MAX_ACCURACY_M } from './countSession.ts';

/** A fix this close to an edge, or closer than its own accuracy, may be on the wrong side. */
const MIN_EDGE_MARGIN_M = 20;
/** A reported accuracy is a 68% radius, so one fix past the margin can still be wrong. */
const FIXES_TO_SETTLE = 2;

export type Crossing = 'inward' | 'outward';

export interface StatusFix {
  readonly status: AreaStatus;
  /** Meters from the fix to the nearest edge of the area or the circle */
  readonly edgeMeters: number;
  readonly accuracy: number;
  readonly time: number;
}

export interface SettledState {
  /** Null until the first fix good enough to trust */
  readonly settled: AreaStatus | null;
  readonly candidate: AreaStatus['kind'] | null;
  readonly candidateFixes: number;
  readonly lastTime: number | null;
}

export const UNSETTLED: SettledState = { settled: null, candidate: null, candidateFixes: 0, lastTime: null };

function rank(status: AreaStatus): number {
  switch (status.kind) {
    case 'outside-circle':
      return 0;
    case 'outside-area':
      return 1;
    case 'in-area':
    case 'in-circle':
      return 2;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

function crossingBetween(from: AreaStatus, to: AreaStatus): Crossing {
  return rank(to) > rank(from) ? 'inward' : 'outward';
}

/**
 * Moves the settled status to a new one only after it holds clear of every edge, so GPS wobble near an edge changes nothing.
 * @returns the next state, and the crossing when the settled status changed; the first settled status is no crossing
 */
export function nextSettledState(
  state: SettledState,
  fix: StatusFix
): { readonly state: SettledState; readonly crossing: Crossing | null } {
  // A rough fix breaks the run, so two fixes far apart in time do not settle a change.
  if (fix.accuracy > MAX_ACCURACY_M) return { state: { ...state, candidate: null, candidateFixes: 0 }, crossing: null };
  if (state.lastTime !== null && fix.time <= state.lastTime) return { state, crossing: null };
  const steady = { ...state, candidate: null, candidateFixes: 0, lastTime: fix.time };
  if (!state.settled) return { state: { ...steady, settled: fix.status }, crossing: null };
  const isClearOfEdge = fix.edgeMeters >= Math.max(MIN_EDGE_MARGIN_M, fix.accuracy);
  if (fix.status.kind === state.settled.kind || !isClearOfEdge) return { state: steady, crossing: null };
  const candidateFixes = fix.status.kind === state.candidate ? state.candidateFixes + 1 : 1;
  if (candidateFixes < FIXES_TO_SETTLE) {
    return { state: { ...steady, candidate: fix.status.kind, candidateFixes }, crossing: null };
  }
  return { state: { ...steady, settled: fix.status }, crossing: crossingBetween(state.settled, fix.status) };
}

/**
 * Settles the area status from each fix of the control's location watch, starting unsettled.
 * @param circle the circle polygon drawn on the map
 * @returns a function that stops following
 */
export function followSettledStatus(
  control: GeolocateControl,
  area: AreaLinkData,
  circle: Feature<Polygon>,
  onSettle: (status: AreaStatus) => void,
  onCrossing: (crossing: Crossing) => void
): () => void {
  let state = UNSETTLED;

  function handleLocation(position: GeolocatePositionEvent): void {
    const { longitude, latitude, accuracy } = position.coords;
    const next = nextSettledState(state, {
      status: areaStatusAt(area, circle, longitude, latitude),
      edgeMeters: metersToNearestEdge(area, circle, longitude, latitude),
      accuracy,
      time: position.timestamp,
    });
    const previous = state.settled;
    state = next.state;
    if (state.settled && state.settled !== previous) onSettle(state.settled);
    if (next.crossing) onCrossing(next.crossing);
  }

  control.on('geolocate', handleLocation);
  return () => control.off('geolocate', handleLocation);
}
