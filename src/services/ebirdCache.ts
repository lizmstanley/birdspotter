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

/** Returns today's saved copy of a request, or null when there is none or it no longer validates. */
export function readTodaysCopy<T>(requestKey: string, isItem: (value: unknown) => value is T): T[] | null {
  const raw = browserStorage()?.getItem(dayPrefix(new Date()) + requestKey) ?? null;
  if (raw === null) return null;
  const items = parseJson(raw);
  if (!Array.isArray(items) || !items.every(isItem)) return null;
  return items;
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
    store.setItem(todayPrefix + requestKey, JSON.stringify(items));
  } catch {
    // Full or blocked storage only costs a repeat request; the fetched data is still shown.
  }
}
