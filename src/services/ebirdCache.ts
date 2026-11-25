import { isRecord } from './http.ts';

const CACHE_PREFIX = 'cbc_ebird_cache:';

function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayPrefix(now: Date): string {
  return `${CACHE_PREFIX}${localDay(now)}:`;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface SavedCopy {
  readonly savedAt: number;
  readonly items: unknown;
}

function isSavedCopy(value: unknown): value is SavedCopy {
  return isRecord(value) && typeof value.savedAt === 'number' && 'items' in value;
}

/**
 * Returns today's saved copy of a request, or null when there is none, it no longer validates, or it is too old.
 * @param maxAgeMs how old a copy may be; omitted, any copy from today is used
 */
export function readTodaysCopy<T>(
  requestKey: string,
  isItem: (value: unknown) => value is T,
  maxAgeMs?: number
): T[] | null {
  const raw = browserStorage()?.getItem(dayPrefix(new Date()) + requestKey) ?? null;
  if (raw === null) return null;
  const saved = parseJson(raw);
  if (!isSavedCopy(saved) || !Array.isArray(saved.items) || !saved.items.every(isItem)) return null;
  if (maxAgeMs !== undefined && Date.now() - saved.savedAt >= maxAgeMs) return null;
  return saved.items;
}

function dropOtherDays(store: Storage, todayPrefix: string): void {
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(CACHE_PREFIX) && !key.startsWith(todayPrefix)) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

/** Saves a request's result for the rest of the local day and drops copies from earlier days. */
export function saveTodaysCopy(requestKey: string, items: readonly unknown[]): void {
  const store = browserStorage();
  if (!store) return;
  const todayPrefix = dayPrefix(new Date());
  try {
    dropOtherDays(store, todayPrefix);
    const copy: SavedCopy = { savedAt: Date.now(), items };
    store.setItem(todayPrefix + requestKey, JSON.stringify(copy));
  } catch {
    // Full or blocked storage only costs a repeat request; the fetched data is still shown.
  }
}

/** Drops today's saved copy of a request so the next fetch goes to the network. */
export function forgetTodaysCopy(requestKey: string): void {
  try {
    browserStorage()?.removeItem(dayPrefix(new Date()) + requestKey);
  } catch {
    // Blocked storage holds no saved copy to drop.
  }
}
