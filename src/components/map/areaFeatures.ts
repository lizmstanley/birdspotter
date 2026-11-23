import { getPaletteColorForCode } from '../../services/kmlParser.ts';
import { areaDisplayName, isOuterCircleBoundary } from './mapText.ts';
import type { AreaBoundaryItem } from './types.ts';

export function toUpperCaseSet(codes: readonly string[]): Set<string> {
  return new Set(codes.map((c) => c.toUpperCase()));
}

export function excludeNotCounted(
  boundaries: readonly AreaBoundaryItem[],
  notCountedCodes: readonly string[]
): AreaBoundaryItem[] {
  const notCounted = toUpperCaseSet(notCountedCodes);
  return boundaries.filter((b) => !notCounted.has(b.code.toUpperCase()));
}

export function buildAreaFeatures(
  boundaries: readonly AreaBoundaryItem[],
  notCountedCodes: readonly string[]
) {
  const notCounted = toUpperCaseSet(notCountedCodes);
  return boundaries.map((item, idx) => {
    const isOuter = isOuterCircleBoundary(item.code, item.label);
    const isExcluded = notCounted.has(item.code.toUpperCase());
    const palette = getPaletteColorForCode(item.code, idx);
    return {
      type: 'Feature' as const,
      id: idx + 1,
      properties: {
        code: item.code,
        label: item.label ?? '',
        isOuter,
        fillColor: isOuter ? '#000000' : isExcluded ? '#64748b' : palette.fill,
        strokeColor: isOuter ? '#1e293b' : isExcluded ? '#475569' : palette.stroke,
        fillOpacity: isOuter ? 0 : isExcluded ? 0.32 : 0.28,
        hoverOpacity: isOuter ? 0 : isExcluded ? 0.45 : 0.52,
        lineWidth: isOuter ? 3.5 : 2.5,
      },
      geometry: item.boundary_geojson,
    };
  });
}

export function describeHoveredArea(code: string, participantCount: number, isExcluded: boolean) {
  const displayName = areaDisplayName(code);
  if (isExcluded) {
    return {
      displayName,
      tooltipCount: 'Not counted in this circle',
      pill: `${displayName} · Not Counted`,
    };
  }
  return {
    displayName,
    tooltipCount:
      participantCount === 1 ? '1 participant assigned' : `${participantCount} participants assigned`,
    pill: `${displayName} · ${participantCount} assigned`,
  };
}
