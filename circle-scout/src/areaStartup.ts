import { readAreaLinkText } from './areaLinkText.ts';
import { NO_SAVED_AREAS, readSavedAreas, withArea, writeSavedAreas, type AreaStorage, type SavedAreas } from './savedAreas.ts';

export interface AreaStartup {
  readonly saved: SavedAreas;
  readonly error: string | null;
  readonly notice: string | null;
}

export const STORAGE_BLOCKED_MESSAGE =
  'Your browser blocked saving areas. Loaded areas work until you close Circle Scout.';
export const BROWSER_TAB_NOTICE =
  'This link opened in a browser tab. Areas saved here may not show in the installed Circle Scout. ' +
  'If you installed it, open Circle Scout and paste the same link with Paste link.';

export function unreadableAreasMessage(count: number): string {
  return count === 1
    ? 'A saved area could not be read and was removed. Load it again from its link.'
    : `${count} saved areas could not be read and were removed. Load them again from their links.`;
}

/** @returns the browser-tab notice when an area link opened outside the installed app, else null */
export function noticeForAddressLoad(isRunningInstalled: boolean): string | null {
  return isRunningInstalled ? null : BROWSER_TAB_NOTICE;
}

/** @returns the page address when it carries area data, after removing that data from the address bar */
export function takeAreaLinkFromAddress(win: Window): string | null {
  const { location, history } = win;
  if (location.hash.length < 2) return null;
  const href = location.href;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  return href;
}

interface StoredStart {
  readonly saved: SavedAreas;
  readonly isStorageBlocked: boolean;
  readonly unreadableCount: number;
}

function readStoredAreas(storage: AreaStorage | null): StoredStart {
  if (!storage) return { saved: NO_SAVED_AREAS, isStorageBlocked: true, unreadableCount: 0 };
  try {
    return { ...readSavedAreas(storage), isStorageBlocked: false };
  } catch {
    return { saved: NO_SAVED_AREAS, isStorageBlocked: true, unreadableCount: 0 };
  }
}

/**
 * Reads the saved areas, adds the area from the opening link if there is one, and saves the result.
 * @param startLink the page address when it carried area data, else null
 */
export function startSavedAreas(storage: AreaStorage | null, startLink: string | null, isRunningInstalled: boolean): AreaStartup {
  const stored = readStoredAreas(storage);
  const read = startLink === null ? null : readAreaLinkText(startLink);
  const saved = read?.status === 'read' ? withArea(stored.saved, read.payload, read.data) : stored.saved;
  const isChanged = read?.status === 'read' || stored.unreadableCount > 0;
  const isBlocked = isChanged && (storage === null || stored.isStorageBlocked || !writeSavedAreas(storage, saved));

  const errors = [
    ...(stored.unreadableCount > 0 ? [unreadableAreasMessage(stored.unreadableCount)] : []),
    ...(read?.status === 'failed' ? [read.message] : []),
    ...(isBlocked ? [STORAGE_BLOCKED_MESSAGE] : []),
  ];
  return {
    saved,
    error: errors.length > 0 ? errors.join(' ') : null,
    notice: read?.status === 'read' ? noticeForAddressLoad(isRunningInstalled) : null,
  };
}
