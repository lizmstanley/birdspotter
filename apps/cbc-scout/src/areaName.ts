import type { AreaLinkData } from '../../../src/services/areaLink.ts';

export function areaName(data: AreaLinkData): string {
  const { circleName, areaCode, areaLabel } = data;
  if (!areaLabel) return `${circleName}: Area ${areaCode}`;
  if (areaLabel.startsWith(areaCode)) return `${circleName}: ${areaLabel}`;
  return `${circleName}: Area ${areaCode}, ${areaLabel}`;
}
