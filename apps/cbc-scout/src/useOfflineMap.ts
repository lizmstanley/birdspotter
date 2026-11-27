import { useEffect, useMemo, useRef, useState } from 'react';
import { outlineBox, type LngLatBox } from './areaOutline.ts';
import {
  browserCaches,
  deleteSavedMap,
  isSameBox,
  readSavedMapInfo,
  saveAreaMap,
  type MapDownloadProgress,
  type SavedMapInfo,
} from './offlineMap.ts';
import { describeMapDownloadError } from './offlineMapErrors.ts';
import type { SavedArea } from './savedAreas.ts';

export type OfflineMapState =
  | { readonly status: 'unsupported' }
  | { readonly status: 'checking' }
  | { readonly status: 'none' }
  | { readonly status: 'saving'; readonly progress: MapDownloadProgress }
  | { readonly status: 'saved'; readonly info: SavedMapInfo }
  | { readonly status: 'failed'; readonly message: string };

export interface OfflineMap {
  readonly state: OfflineMapState;
  readonly save: () => void;
  readonly remove: () => void;
}

interface AreaMapState {
  readonly areaKey: string;
  readonly state: OfflineMapState;
}

const CHECKING: OfflineMapState = { status: 'checking' };
const NO_MAP: OfflineMapState = { status: 'none' };
const STOPPED_BY_AREA_CHANGE: OfflineMapState = {
  status: 'failed',
  message: 'The street map stopped saving when the active area changed. Save it again.',
};

/**
 * The saved street map of the active area. A download stops when the active area changes, and that area says so
 * when it is active again. A map saved for another
 * outline, from before the compiler sent the area again, is removed, so a saved map always covers the area.
 */
export function useOfflineMap(area: SavedArea | null): OfflineMap {
  const caches = browserCaches();
  const areaKey = area?.key ?? null;
  // Keyed on the box's values: loading the same area again decodes a new outline object, which must not stop a download.
  const boxKey = area ? JSON.stringify(outlineBox(area.data.outline)) : null;
  const box = useMemo<LngLatBox | null>(() => (boxKey ? JSON.parse(boxKey) : null), [boxKey]);
  const [current, setCurrent] = useState<AreaMapState | null>(null);
  // The running download, cleared when it ends.
  const downloadRef = useRef<AbortController | null>(null);
  const stoppedAreaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!areaKey || !box || !caches) return;
    let isCurrent = true;
    void readSavedMapInfo(caches, areaKey).then(async (info) => {
      const isCovering = info !== null && isSameBox(info.box, box);
      if (info && !isCovering) await deleteSavedMap(caches, areaKey);
      if (!isCurrent) return;
      if (info && isCovering) {
        setCurrent({ areaKey, state: { status: 'saved', info } });
        return;
      }
      const wasStopped = stoppedAreaKeyRef.current === areaKey;
      if (wasStopped) stoppedAreaKeyRef.current = null;
      setCurrent({ areaKey, state: wasStopped ? STOPPED_BY_AREA_CHANGE : NO_MAP });
    });
    return () => {
      isCurrent = false;
      if (!downloadRef.current) return;
      stoppedAreaKeyRef.current = areaKey;
      downloadRef.current.abort();
      downloadRef.current = null;
    };
  }, [areaKey, box, caches]);

  async function save(): Promise<void> {
    if (!area || !box || !caches) return;
    downloadRef.current?.abort();
    const download = new AbortController();
    downloadRef.current = download;
    const show = (state: OfflineMapState) => {
      if (!download.signal.aborted) setCurrent({ areaKey: area.key, state });
    };
    stoppedAreaKeyRef.current = null;
    show({ status: 'saving', progress: { done: 0, total: 0 } });
    try {
      const info = await saveAreaMap({
        areaKey: area.key,
        box,
        caches,
        fetch: (input, init) => fetch(input, init),
        signal: download.signal,
        onProgress: (progress) => show({ status: 'saving', progress }),
      });
      show({ status: 'saved', info });
    } catch (error) {
      show({ status: 'failed', message: describeMapDownloadError(error) });
    } finally {
      if (downloadRef.current === download) downloadRef.current = null;
    }
  }

  async function remove(): Promise<void> {
    if (!area || !caches) return;
    const key = area.key;
    const isDeleted = await deleteSavedMap(caches, key);
    setCurrent({
      areaKey: key,
      state: isDeleted ? NO_MAP : { status: 'failed', message: 'CBC Scout could not remove the saved street map.' },
    });
  }

  function stateNow(): OfflineMapState {
    if (!caches) return { status: 'unsupported' };
    return current && current.areaKey === areaKey ? current.state : CHECKING;
  }

  return { state: stateNow(), save: () => void save(), remove: () => void remove() };
}
