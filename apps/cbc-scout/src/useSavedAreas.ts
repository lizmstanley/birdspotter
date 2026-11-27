import type { KeyValueStorage } from '@birdspotter/birding-core/storage.ts';
import { useEffect, useState } from 'react';
import { useLatest } from '@birdspotter/birding-core/useLatest.ts';
import { readAreaLinkText } from './areaLinkText.ts';
import { browserCaches, deleteSavedMap } from './offlineMap.ts';
import { noticeForAddressLoad, STORAGE_BLOCKED_MESSAGE, takeAreaLinkFromAddress, type AreaStartup } from './areaStartup.ts';
import { isRunningInstalled } from '@birdspotter/birding-core/installOffer.ts';
import {
  activeSavedArea,
  withActiveArea,
  withArea,
  withoutArea,
  writeSavedAreas,
  type SavedAreas,
} from './savedAreas.ts';

export type AreaLinkSource = 'address' | 'paste' | 'scan';

interface SavedAreasOptions {
  readonly startup: AreaStartup;
  readonly storage: KeyValueStorage | null;
  readonly setError: (message: string | null) => void;
  readonly setNotice: (message: string | null) => void;
  /** Runs after a load from any source makes its area the active one. */
  readonly onLoad: () => void;
}

export function useSavedAreas({ startup, storage, setError, setNotice, onLoad }: SavedAreasOptions) {
  const [saved, setSaved] = useState(startup.saved);

  function keep(next: SavedAreas): void {
    setSaved(next);
    if (!storage || !writeSavedAreas(storage, next)) setError(STORAGE_BLOCKED_MESSAGE);
  }

  /** @returns true when the text held an area and it is now the active one */
  function loadAreaText(text: string, source: AreaLinkSource): boolean {
    const read = readAreaLinkText(text);
    if (read.status === 'failed') {
      setError(read.message);
      return false;
    }
    setError(null);
    setNotice(source === 'address' ? noticeForAddressLoad(isRunningInstalled(window)) : null);
    keep(withArea(saved, read.payload, read.data));
    onLoad();
    return true;
  }

  const loadAreaTextRef = useLatest(loadAreaText);
  useEffect(() => {
    function handleHashChange(): void {
      const link = takeAreaLinkFromAddress(window);
      if (link !== null) loadAreaTextRef.current(link, 'address');
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [loadAreaTextRef]);

  return {
    areas: saved.areas,
    activeArea: activeSavedArea(saved),
    loadAreaText,
    pickArea: (key: string) => keep(withActiveArea(saved, key)),
    removeArea: (key: string) => {
      keep(withoutArea(saved, key));
      const caches = browserCaches();
      // A map left by a blocked Cache API has no area to show it in, so the counter is not told.
      if (caches) void deleteSavedMap(caches, key);
    },
  };
}
