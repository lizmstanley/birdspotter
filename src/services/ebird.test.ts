import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHotspotsInCircle, fetchRecentSightingsInCircle } from './ebird.ts';
import { EbirdKeyRejectedError, EbirdRequestError } from './errors.ts';

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
