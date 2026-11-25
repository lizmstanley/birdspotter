import type { KeyValueStorage } from '../storage.ts';

export class MemoryStorage implements KeyValueStorage {
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
