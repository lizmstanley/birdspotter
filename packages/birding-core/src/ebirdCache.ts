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

export interface SavedItems<T> {
  readonly items: T[];
  /** When the copy was saved, in epoch milliseconds. */
  readonly savedAt: number;
}

function previousDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

function readCopy<T>(
  storageKey: string,
  isItem: (value: unknown) => value is T,
  now: number,
  maxAgeMs: number | undefined
): SavedItems<T> | null {
  const raw = browserStorage()?.getItem(storageKey) ?? null;
  if (raw === null) return null;
  const saved = parseJson(raw);
  if (!isSavedCopy(saved) || !Array.isArray(saved.items) || !saved.items.every(isItem)) return null;
  if (hasExpired(saved, now)) return null;
  if (maxAgeMs !== undefined && now - saved.savedAt >= maxAgeMs) return null;
  return { items: saved.items, savedAt: saved.savedAt };
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
): SavedItems<T> | null {
  const now = new Date();
  return readCopy(dayPrefix(now) + requestKey, isItem, now.getTime(), maxAgeMs);
}

/**
 * Like `readTodaysCopy`, and also takes a copy saved the day before, so a copy from late evening still counts after
 * midnight.
 */
export function readRecentCopy<T>(
  requestKey: string,
  isItem: (value: unknown) => value is T,
  maxAgeMs: number
): SavedItems<T> | null {
  const now = new Date();
  return (
    readCopy(dayPrefix(now) + requestKey, isItem, now.getTime(), maxAgeMs) ??
    readCopy(dayPrefix(previousDay(now)) + requestKey, isItem, now.getTime(), maxAgeMs)
  );
}

interface KeepRule {
  readonly todayPrefix: string;
  readonly yesterdayPrefix: string;
  readonly now: number;
  readonly recentAgeMs: number;
}

function isStale(store: Storage, key: string, rule: KeepRule): boolean {
  const isToday = key.startsWith(rule.todayPrefix);
  if (!isToday && !key.startsWith(rule.yesterdayPrefix)) return true;
  const saved = parseJson(store.getItem(key) ?? '');
  if (!isSavedCopy(saved)) return !isToday;
  if (hasExpired(saved, rule.now)) return true;
  return !isToday && rule.now - saved.savedAt >= rule.recentAgeMs;
}

function dropStaleCopies(store: Storage, rule: KeepRule): void {
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(CACHE_PREFIX) && isStale(store, key, rule)) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

/**
 * Saves a request's result for the rest of the local day. Drops expired copies, copies from the day before once
 * `recentAgeMs` old, and every copy from earlier days.
 * @param recentAgeMs how old a copy from the day before may be and still be kept for `readRecentCopy`
 * @param lifetimeMs how long the copy may be used; omitted, until the end of the local day
 */
export function saveTodaysCopy(
  requestKey: string,
  items: readonly unknown[],
  recentAgeMs: number,
  lifetimeMs?: number
): void {
  const store = browserStorage();
  if (!store) return;
  const now = Date.now();
  const today = new Date(now);
  const todayPrefix = dayPrefix(today);
  try {
    dropStaleCopies(store, { todayPrefix, yesterdayPrefix: dayPrefix(previousDay(today)), now, recentAgeMs });
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

/** Drops the copies of a request that `readRecentCopy` reads, so the next fetch goes to the network. */
export function forgetRecentCopies(requestKey: string): void {
  const now = new Date();
  try {
    browserStorage()?.removeItem(dayPrefix(now) + requestKey);
    browserStorage()?.removeItem(dayPrefix(previousDay(now)) + requestKey);
  } catch {
    // Blocked storage holds no saved copy to drop.
  }
}
