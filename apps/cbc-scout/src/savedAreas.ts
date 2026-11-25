import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { decodeAreaLink, type AreaLinkData } from '../../../src/services/areaLink.ts';

export interface SavedArea {
  readonly key: string;
  readonly payload: string;
  readonly data: AreaLinkData;
}

export interface SavedAreas {
  /** Oldest load first. */
  readonly areas: readonly SavedArea[];
  readonly activeKey: string | null;
}

export interface StoredAreasRead {
  readonly saved: SavedAreas;
  readonly unreadableCount: number;
}

export const AREAS_STORAGE_KEY = 'cbc_scout_areas';
export const ACTIVE_AREA_STORAGE_KEY = 'cbc_scout_active_area';

export const NO_SAVED_AREAS: SavedAreas = { areas: [], activeKey: null };

export function savedAreaKey(data: Pick<AreaLinkData, 'circleCode' | 'areaCode'>): string {
  return `${data.circleCode.toUpperCase()}/${data.areaCode.toUpperCase()}`;
}

export function activeSavedArea(saved: SavedAreas): SavedArea | null {
  return saved.areas.find((area) => area.key === saved.activeKey) ?? null;
}

/** @returns the areas with this one added, or replacing its saved copy, and made active */
export function withArea(saved: SavedAreas, payload: string, data: AreaLinkData): SavedAreas {
  const key = savedAreaKey(data);
  return {
    areas: [...saved.areas.filter((area) => area.key !== key), { key, payload, data }],
    activeKey: key,
  };
}

/** @returns the areas without this one; removing the active area makes the latest remaining one active */
export function withoutArea(saved: SavedAreas, key: string): SavedAreas {
  const areas = saved.areas.filter((area) => area.key !== key);
  const activeKey = saved.activeKey === key ? (areas.at(-1)?.key ?? null) : saved.activeKey;
  return { areas, activeKey };
}

export function withActiveArea(saved: SavedAreas, key: string): SavedAreas {
  return saved.areas.some((area) => area.key === key) ? { ...saved, activeKey: key } : saved;
}

function readPayloadList(storage: KeyValueStorage): { payloads: unknown[]; isCorrupt: boolean } {
  const text = storage.getItem(AREAS_STORAGE_KEY);
  if (text === null) return { payloads: [], isCorrupt: false };
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? { payloads: parsed, isCorrupt: false } : { payloads: [], isCorrupt: true };
  } catch {
    return { payloads: [], isCorrupt: true };
  }
}

function decodedOrNull(payload: unknown): AreaLinkData | null {
  if (typeof payload !== 'string') return null;
  try {
    return decodeAreaLink(payload);
  } catch {
    return null;
  }
}

/** Saved payloads are decoded again so a stored area passes the same checks as a fresh link. */
export function readSavedAreas(storage: KeyValueStorage): StoredAreasRead {
  const { payloads, isCorrupt } = readPayloadList(storage);
  let saved = NO_SAVED_AREAS;
  let unreadableCount = isCorrupt ? 1 : 0;
  for (const payload of payloads) {
    const data = decodedOrNull(payload);
    if (data && typeof payload === 'string') saved = withArea(saved, payload, data);
    else unreadableCount += 1;
  }
  const storedActiveKey = storage.getItem(ACTIVE_AREA_STORAGE_KEY);
  const activeKey = saved.areas.some((area) => area.key === storedActiveKey)
    ? storedActiveKey
    : (saved.areas.at(-1)?.key ?? null);
  return { saved: { ...saved, activeKey }, unreadableCount };
}

/** @returns false when the browser blocks or fills storage */
export function writeSavedAreas(storage: KeyValueStorage, saved: SavedAreas): boolean {
  try {
    storage.setItem(AREAS_STORAGE_KEY, JSON.stringify(saved.areas.map((area) => area.payload)));
    if (saved.activeKey === null) storage.removeItem(ACTIVE_AREA_STORAGE_KEY);
    else storage.setItem(ACTIVE_AREA_STORAGE_KEY, saved.activeKey);
    return true;
  } catch {
    return false;
  }
}
