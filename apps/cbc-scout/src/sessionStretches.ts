import { metersBetween, type CountSession, type RoutePoint, type TravelMode } from './countSession.ts';

export interface Stretch {
  readonly mode: TravelMode;
  /** A straight line across a break in recording */
  readonly isGap: boolean;
  readonly startTime: number;
  readonly endTime: number;
  readonly miles: number;
  /** [longitude, latitude] pairs in time order */
  readonly path: readonly (readonly [number, number])[];
}

export interface SessionTotals {
  readonly totalHours: number;
  readonly footHours: number;
  readonly carHours: number;
  readonly footMiles: number;
  readonly carMiles: number;
  readonly gapMiles: number;
}

interface Segment {
  readonly from: RoutePoint;
  readonly to: RoutePoint;
  readonly isGap: boolean;
  readonly meters: number;
  readonly mode: TravelMode;
}

const CAR_SPEED_M_PER_S = 10_000 / 3600;
/** A shorter run of the other mode is taken as a stop at a light or GPS noise, not a change of mode. */
const MIN_STRETCH_MS = 2 * 60_000;
const METERS_PER_MILE = 1609.344;
const MS_PER_HOUR = 3_600_000;

function modeFromSpeed(meters: number, from: RoutePoint, to: RoutePoint): TravelMode {
  const seconds = (to.time - from.time) / 1000;
  return seconds > 0 && meters / seconds > CAR_SPEED_M_PER_S ? 'car' : 'foot';
}

function routeSegments(session: CountSession): Segment[] {
  const segments: Segment[] = [];
  let previous: RoutePoint | null = null;
  for (const track of session.tracks) {
    for (const [index, point] of track.entries()) {
      if (previous) {
        const meters = metersBetween(previous, point);
        segments.push({ from: previous, to: point, isGap: index === 0, meters, mode: modeFromSpeed(meters, previous, point) });
      }
      previous = point;
    }
  }
  return segments;
}

/** Splits segments into runs of one mode; each gap is a run of its own. */
function runsOf(segments: readonly Segment[]): Segment[][] {
  const runs: Segment[][] = [];
  for (const segment of segments) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && !last.isGap && !segment.isGap && last.mode === segment.mode) run.push(segment);
    else runs.push([segment]);
  }
  return runs;
}

function runDuration(run: readonly Segment[]): number {
  return run[run.length - 1].to.time - run[0].from.time;
}

function withShortRunsMerged(segments: readonly Segment[]): Segment[] {
  let previousMode: TravelMode | null = null;
  return runsOf(segments).flatMap((run) => {
    if (run[0].isGap) return run;
    const mode = previousMode !== null && runDuration(run) < MIN_STRETCH_MS ? previousMode : run[0].mode;
    previousMode = mode;
    return run.map((segment) => ({ ...segment, mode }));
  });
}

function correctedMode(session: CountSession, segment: Segment): TravelMode {
  const middle = (segment.from.time + segment.to.time) / 2;
  const correction = session.corrections.filter((item) => item.from <= middle && middle <= item.to).at(-1);
  return correction?.mode ?? segment.mode;
}

function toStretch(run: readonly Segment[]): Stretch {
  const meters = run.reduce((sum, segment) => sum + segment.meters, 0);
  return {
    mode: run[0].mode,
    isGap: run[0].isGap,
    startTime: run[0].from.time,
    endTime: run[run.length - 1].to.time,
    miles: meters / METERS_PER_MILE,
    path: [run[0].from, ...run.map((segment) => segment.to)].map((point) => [point.lng, point.lat] as const),
  };
}

/** The route in time order, each stretch with its mode: from speed, then the counter's corrections. */
export function sessionStretches(session: CountSession): Stretch[] {
  const segments = withShortRunsMerged(routeSegments(session)).map((segment) => ({
    ...segment,
    mode: correctedMode(session, segment),
  }));
  return runsOf(segments).map(toStretch);
}

function milesFor(stretches: readonly Stretch[], keep: (stretch: Stretch) => boolean): number {
  return stretches.filter(keep).reduce((sum, stretch) => sum + stretch.miles, 0);
}

/** Time before the first point goes to the first stretch's mode, and time after the last point to the last one's. */
function carMilliseconds(session: CountSession, stretches: readonly Stretch[], endTime: number): number {
  const first = stretches.at(0);
  const last = stretches.at(-1);
  if (!first || !last) return 0;
  const inStretches = stretches
    .filter((stretch) => stretch.mode === 'car')
    .reduce((sum, stretch) => sum + stretch.endTime - stretch.startTime, 0);
  const before = first.mode === 'car' ? Math.max(0, first.startTime - session.startTime) : 0;
  const after = last.mode === 'car' ? Math.max(0, endTime - last.endTime) : 0;
  return inStretches + before + after;
}

/** @param now the end time while the session still runs */
export function sessionTotals(session: CountSession, stretches: readonly Stretch[], now: number): SessionTotals {
  const endTime = session.stopTime ?? now;
  const totalMs = Math.max(0, endTime - session.startTime);
  const carMs = Math.min(totalMs, carMilliseconds(session, stretches, endTime));
  return {
    totalHours: totalMs / MS_PER_HOUR,
    footHours: (totalMs - carMs) / MS_PER_HOUR,
    carHours: carMs / MS_PER_HOUR,
    footMiles: milesFor(stretches, (stretch) => stretch.mode === 'foot'),
    carMiles: milesFor(stretches, (stretch) => stretch.mode === 'car'),
    gapMiles: milesFor(stretches, (stretch) => stretch.isGap),
  };
}
