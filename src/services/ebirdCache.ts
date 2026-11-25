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
  readonly expiresAt?: number;
  readonly items: unknown;
}

function isSavedCopy(value: unknown): value is SavedCopy {
  return (
    isRecord(value) &&
    typeof value.savedAt === 'number' &&
    (value.expiresAt === undefined || typeof value.expiresAt === 'number') &&
    'items' in value
  );
}

function hasExpired(copy: SavedCopy, now: number): boolean {
  return copy.expiresAt !== undefined && now >= copy.expiresAt;
}

/**
 * Returns today's saved copy of a request, or null when there is none, it no longer validates, it has expired, or it
 * is too old.
 * @param maxAgeMs how old a copy may be; omitted, any unexpired copy from today is used
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
  const now = Date.now();
  if (hasExpired(saved, now)) return null;
  if (maxAgeMs !== undefined && now - saved.savedAt >= maxAgeMs) return null;
  return saved.items;
}

function isStale(store: Storage, key: string, todayPrefix: string, now: number): boolean {
  if (!key.startsWith(todayPrefix)) return true;
  const saved = parseJson(store.getItem(key) ?? '');
  return isSavedCopy(saved) && hasExpired(saved, now);
}

function dropStaleCopies(store: Storage, todayPrefix: string, now: number): void {
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(CACHE_PREFIX) && isStale(store, key, todayPrefix, now)) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

/**
 * Saves a request's result for the rest of the local day, and drops copies from earlier days and expired copies.
 * @param lifetimeMs how long the copy may be used; omitted, until the end of the local day
 */
export function saveTodaysCopy(requestKey: string, items: readonly unknown[], lifetimeMs?: number): void {
  const store = browserStorage();
  if (!store) return;
  const now = Date.now();
  const todayPrefix = dayPrefix(new Date(now));
  try {
    dropStaleCopies(store, todayPrefix, now);
    const copy: SavedCopy = {
      savedAt: now,
      items,
      ...(lifetimeMs === undefined ? {} : { expiresAt: now + lifetimeMs }),
    };
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
