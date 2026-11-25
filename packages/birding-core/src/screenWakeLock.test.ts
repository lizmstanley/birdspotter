import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { keepScreenOn } from './screenWakeLock.ts';

class FakeSentinel {
  released = false;
  releaseCount = 0;

  async release(): Promise<void> {
    this.released = true;
    this.releaseCount += 1;
  }
}

interface FakePage {
  visibilityState: DocumentVisibilityState;
  listener: (() => void) | null;
  sentinels: FakeSentinel[];
  isRefusing: boolean;
}

const page: FakePage = { visibilityState: 'visible', listener: null, sentinels: [], isRefusing: false };

function installWakeLock(): void {
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        if (page.isRefusing) throw new DOMException('not allowed', 'NotAllowedError');
        const sentinel = new FakeSentinel();
        page.sentinels.push(sentinel);
        return sentinel;
      },
    },
  });
}

beforeEach(() => {
  page.visibilityState = 'visible';
  page.listener = null;
  page.sentinels = [];
  page.isRefusing = false;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get visibilityState() {
        return page.visibilityState;
      },
      addEventListener: (_type: string, listener: () => void) => (page.listener = listener),
      removeEventListener: () => (page.listener = null),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis.navigator, 'wakeLock');
});

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('asks again when the page is shown after the browser released the lock', async () => {
  installWakeLock();
  keepScreenOn(() => assert.fail('wake lock reported unavailable'));
  await settle();
  page.sentinels[0].released = true;
  page.visibilityState = 'hidden';
  page.listener?.();
  page.visibilityState = 'visible';
  page.listener?.();
  await settle();
  assert.equal(page.sentinels.length, 2);
});

test('does not ask again while the lock is still held', async () => {
  installWakeLock();
  keepScreenOn(() => {});
  await settle();
  page.listener?.();
  await settle();
  assert.equal(page.sentinels.length, 1);
});

test('releases the lock when stopped, including one granted after the stop', async () => {
  installWakeLock();
  const release = keepScreenOn(() => {});
  await settle();
  release();
  assert.equal(page.sentinels[0].releaseCount, 1);
  const releaseEarly = keepScreenOn(() => {});
  releaseEarly();
  await settle();
  assert.equal(page.sentinels[1].releaseCount, 1);
  assert.equal(page.listener, null);
});

test('reports a browser with no wake lock', () => {
  let unavailableCount = 0;
  keepScreenOn(() => (unavailableCount += 1));
  assert.equal(unavailableCount, 1);
});

test('reports a refused wake lock', async () => {
  installWakeLock();
  page.isRefusing = true;
  let unavailableCount = 0;
  keepScreenOn(() => (unavailableCount += 1));
  await settle();
  assert.equal(unavailableCount, 1);
});
