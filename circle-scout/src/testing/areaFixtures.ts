import { encodeAreaLink, type AreaLinkData } from '../../../src/services/areaLink.ts';
import type { AreaStorage } from '../savedAreas.ts';

export const SCOUT_URL = 'https://example.test/circle-scout/';

export function areaData(overrides: Partial<AreaLinkData> = {}): AreaLinkData {
  return {
    circleCode: 'MNMI',
    circleName: 'Minneapolis North',
    circleCenter: [-93.25, 44.95],
    areaCode: '12',
    areaLabel: '12 - Richfield',
    outline: {
      type: 'Polygon',
      coordinates: [
        [
          [-93.3, 44.9],
          [-93.2, 44.9],
          [-93.2, 45],
          [-93.3, 45],
          [-93.3, 44.9],
        ],
      ],
    },
    leaders: [{ name: 'Pat Leader', phone: '612-555-0100', email: 'pat@example.test' }],
    ...overrides,
  };
}

export function areaPayload(overrides: Partial<AreaLinkData> = {}): string {
  return encodeAreaLink(areaData(overrides));
}

export class MemoryStorage implements AreaStorage {
  readonly items = new Map<string, string>();
  isBlocked = false;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.isBlocked) throw new DOMException('quota exceeded', 'QuotaExceededError');
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}
