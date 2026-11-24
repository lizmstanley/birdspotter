import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHotspotsInCircle, fetchRecentSightingsInCircle, recentSightingsUrl } from './ebird.ts';
import { forgetTodaysCopy } from './ebirdCache.ts';
import { EbirdKeyRejectedError, EbirdRequestError, UnexpectedResponseError } from './errors.ts';
import { FETCH_TIMEOUT_MS } from './http.ts';

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

let storage: MemoryStorage;
const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('a rejected key is reported as a key problem for both requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Forbidden', { status: 403 }));

  await assert.rejects(
    fetchHotspotsInCircle('bad-key', 44.8, -93.3),
    (err) => err instanceof EbirdKeyRejectedError && err.endpoint === 'hotspots'
  );
  await assert.rejects(
    fetchRecentSightingsInCircle('bad-key', 44.8, -93.3),
    (err) => err instanceof EbirdKeyRejectedError && err.endpoint === 'sightings'
  );
});

test('any other failed request keeps its status and response text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('down for maintenance', { status: 503 }));

  await assert.rejects(
    fetchHotspotsInCircle('key', 44.8, -93.3),
    (err) =>
      err instanceof EbirdRequestError &&
      err.status === 503 &&
      err.responseText === 'down for maintenance'
  );
  await assert.rejects(
    fetchRecentSightingsInCircle('key', 44.8, -93.3),
    (err) => err instanceof EbirdRequestError && err.endpoint === 'sightings' && err.status === 503
  );
});

const HOTSPOT = { locId: 'L1', locName: 'Lake Harriet', lat: 44.92, lng: -93.31, numSpeciesAllTime: 210 };
const SIGHTING = {
  speciesCode: 'bkcchi',
  comName: 'Black-capped Chickadee',
  sciName: 'Poecile atricapillus',
  locId: 'L1',
  locName: 'Lake Harriet',
  obsDt: '2026-11-20 08:15',
  howMany: 4,
  lat: 44.92,
  lng: -93.31,
  subId: 'S1',
};

function respondWith(body: unknown) {
  return async () => Response.json(body);
}

test('well-formed hotspots and sightings come back as sent', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3), [HOTSPOT]);
  assert.deepEqual(await fetchRecentSightingsInCircle('key', 44.8, -93.3), [SIGHTING]);
});

test('a response that is not a list is rejected as unexpected', async (t) => {
  t.mock.method(globalThis, 'fetch', respondWith({ errors: [] }));

  await assert.rejects(
    fetchHotspotsInCircle('key', 44.8, -93.3),
    (err) => err instanceof UnexpectedResponseError && err.source === 'ebird' && err.endpoint === 'hotspots'
  );
});

test('a hotspot off the globe or a sighting missing a field is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [{ ...HOTSPOT, lat: 95 }] : [{ ...SIGHTING, subId: undefined }])
  );

  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3), UnexpectedResponseError);
  await assert.rejects(
    fetchRecentSightingsInCircle('key', 44.8, -93.3),
    (err) => err instanceof UnexpectedResponseError && err.endpoint === 'sightings'
  );
});

test('both requests give up after the shared fetch timeout', async (t) => {
  const timeout = t.mock.method(AbortSignal, 'timeout', () =>
    AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))
  );
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    init.signal?.throwIfAborted();
    return Response.json([]);
  });

  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3), { name: 'TimeoutError' });
  await assert.rejects(fetchRecentSightingsInCircle('key', 44.8, -93.3), { name: 'TimeoutError' });
  assert.deepEqual(
    timeout.mock.calls.map((call) => call.arguments[0]),
    [FETCH_TIMEOUT_MS, FETCH_TIMEOUT_MS]
  );
});

test('the same request is fetched once per local day and again the next day', async (t) => {
  // A zone off UTC, so a cache keyed on the UTC date fails here as it would for a user in Minnesota.
  const realTimeZone = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  t.after(() => {
    if (realTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = realTimeZone;
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 20, 9, 0) });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  await fetchRecentSightingsInCircle('key', 44.8, -93.3);
  t.mock.timers.setTime(new Date(2026, 10, 20, 23, 59).getTime());
  assert.deepEqual(await fetchRecentSightingsInCircle('key', 44.8, -93.3), [SIGHTING]);
  assert.equal(fetchMock.mock.callCount(), 1);

  t.mock.timers.setTime(new Date(2026, 10, 21, 0, 1).getTime());
  await fetchRecentSightingsInCircle('key', 44.8, -93.3);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(storage.length, 1);
});

test('a different place, radius, or day range is its own request', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([SIGHTING]));

  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 15, 14);
  await fetchRecentSightingsInCircle('key', 44.9, -93.3, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.4, 15, 7);
  await fetchRecentSightingsInCircle('key', 44.8, -93.3, 10, 7);
  await fetchHotspotsInCircle('key', 44.8, -93.3);
  assert.equal(fetchMock.mock.callCount(), 6);
});

test('forgetting a saved copy fetches that request again and keeps the others', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) =>
    Response.json(url.includes('/hotspot/') ? [HOTSPOT] : [SIGHTING])
  );

  await fetchRecentSightingsInCircle('key', 44.8, -93.3);
  await fetchHotspotsInCircle('key', 44.8, -93.3);
  forgetTodaysCopy(recentSightingsUrl(44.8, -93.3));
  await fetchRecentSightingsInCircle('key', 44.8, -93.3);
  await fetchHotspotsInCircle('key', 44.8, -93.3);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test('a failed or malformed response is not saved', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3), EbirdRequestError);
  assert.equal(storage.length, 0);

  fetchMock.mock.mockImplementation(respondWith([{ ...HOTSPOT, lat: 95 }]));
  await assert.rejects(fetchHotspotsInCircle('key', 44.8, -93.3), UnexpectedResponseError);
  assert.equal(storage.length, 0);
});

test('a saved copy that no longer validates is fetched again', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));
  await fetchHotspotsInCircle('key', 44.8, -93.3);
  storage.setItem(storage.key(0) ?? '', '[{"locId":1}]');

  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3), [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('requests still work when the browser blocks storage', async (t) => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new DOMException('blocked', 'SecurityError');
    },
    configurable: true,
  });
  const fetchMock = t.mock.method(globalThis, 'fetch', respondWith([HOTSPOT]));

  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3), [HOTSPOT]);
  assert.deepEqual(await fetchHotspotsInCircle('key', 44.8, -93.3), [HOTSPOT]);
  assert.equal(fetchMock.mock.callCount(), 2);
});
