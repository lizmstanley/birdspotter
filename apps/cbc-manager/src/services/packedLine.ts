import type { Position } from 'geojson';
import { isLatitude, isLongitude } from '@birdspotter/birding-core/coordinates.ts';

// 1e-5 degrees is about 1 m, finer than a phone's location fix.
const COORDINATE_SCALE = 1e5;

/** Coarser steps a payload builder tries in order until its payload fits. 0 keeps every point. */
export const SIMPLIFY_TOLERANCES_DEGREES: readonly number[] = [
  0, 0.00001, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01,
];

export function toScaled(value: number): number {
  return Math.round(value * COORDINATE_SCALE);
}

const ORIGIN: Position = [0, 0];

/**
 * @param from the point the first delta is measured from; a line that follows another starts from its end, which
 *   keeps many short lines small
 * @returns the line as whole-number deltas, [x, y] pairs, each from the point before
 */
export function packLine(line: readonly Position[], from: Position = ORIGIN): number[] {
  const deltas: number[] = [];
  let prevX = toScaled(from[0]);
  let prevY = toScaled(from[1]);
  for (const position of line) {
    const x = toScaled(position[0]);
    const y = toScaled(position[1]);
    deltas.push(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return deltas;
}

export function isDeltaList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.length % 2 === 0 && value.every(Number.isSafeInteger);
}

/**
 * @param from the point `packLine` measured from
 * @returns the line `packLine` packed, or null when a position falls off the globe
 */
export function unpackLine(deltas: readonly number[], from: Position = ORIGIN): Position[] | null {
  const line: Position[] = [];
  let x = toScaled(from[0]);
  let y = toScaled(from[1]);
  for (let i = 0; i < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    const lng = x / COORDINATE_SCALE;
    const lat = y / COORDINATE_SCALE;
    if (!isLongitude(lng) || !isLatitude(lat)) return null;
    line.push([lng, lat]);
  }
  return line;
}
