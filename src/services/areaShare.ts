import type { AreaBoundaryRow, AssignmentRow, SavedCircle } from '../db/types.ts';
import { toAreaOutlineGeometry, type AreaLeader, type AreaLinkData } from './areaLink.ts';
import { isOuterCircleName } from './kmlParser.ts';

function isSameArea(code: string | null, areaCode: string): boolean {
  return (code ?? '').toUpperCase() === areaCode.toUpperCase();
}

function presentText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toLeader(row: AssignmentRow): AreaLeader {
  const phone = presentText(row.phone);
  const email = presentText(row.email);
  return { name: row.full_name.trim(), ...(phone ? { phone } : {}), ...(email ? { email } : {}) };
}

/** @returns the link data for the area, or null when the area has no outline a link can carry */
export function buildAreaLinkData(
  circle: SavedCircle,
  boundaries: readonly AreaBoundaryRow[],
  assignments: readonly AssignmentRow[],
  areaCode: string
): AreaLinkData | null {
  const boundary = boundaries.find(
    (b) => isSameArea(b.code, areaCode) && !isOuterCircleName(`${b.code} ${b.label ?? ''}`)
  );
  const outline = boundary ? toAreaOutlineGeometry(boundary.boundary_geojson) : null;
  if (!boundary || !outline) return null;
  const areaLabel = presentText(boundary.label);
  return {
    circleCode: circle.code,
    circleName: circle.name,
    circleCenter: [circle.center_lng, circle.center_lat],
    areaCode: boundary.code,
    ...(areaLabel ? { areaLabel } : {}),
    outline,
    leaders: assignments.filter((row) => row.is_area_leader && isSameArea(row.area, areaCode)).map(toLeader),
  };
}
