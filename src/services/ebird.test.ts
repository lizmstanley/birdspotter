import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHotspotsInCircle, fetchRecentSightingsInCircle } from './ebird.ts';
import { EbirdKeyRejectedError, EbirdRequestError, UnexpectedResponseError } from './errors.ts';
import { FETCH_TIMEOUT_MS } from './http.ts';

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
