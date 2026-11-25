import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { searchAudubonCircles, withAudubonPageDetails, type AudubonCircleResult } from './audubonCircles.ts';
import { UnexpectedResponseError } from '@birdspotter/birding-core/errors.ts';
import { FETCH_TIMEOUT_MS } from '@birdspotter/birding-core/http.ts';

const LAYER = 'https://services.example/arcgis/rest/services/CBC/FeatureServer';
const BLOOMINGTON = { Abbrev: 'MNBL', Name: 'Bloomington', Latitude: 44.83, Longitude: -93.3 };
const NOMINATIM_PLACE = {
  display_name: 'Isabella, Lake County, Minnesota, United States',
  lat: '47.6186',
  lon: '-91.3564',
  address: { village: 'Isabella', state: 'Minnesota' },
};

interface FakeServices {
  readonly query?: () => Response | Promise<Response>;
  readonly nominatim?: () => Response;
}

/** Serves ArcGIS discovery, the layer query, Nominatim, and a missing circle page; returns the `where` clauses the layer received. */
function mockServices(t: TestContext, services: FakeServices): string[] {
  const wheres: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.hostname === 'www.arcgis.com') {
      return Response.json({ results: [{ url: LAYER, owner: 'gis_audubon' }] });
    }
    if (url.pathname.endsWith('/FeatureServer/0')) {
      return Response.json({ fields: ['Abbrev', 'Name', 'Latitude', 'Longitude'].map((name) => ({ name })) });
    }
    if (url.pathname.endsWith('/FeatureServer/0/query')) {
      wheres.push(url.searchParams.get('where') ?? '');
      return services.query ? services.query() : Response.json({ features: [] });
    }
    if (url.pathname.startsWith('/audubon-cbc/')) return new Response('not found', { status: 404 });
    if (url.hostname === 'nominatim.openstreetmap.org') {
      return services.nominatim ? services.nominatim() : Response.json([]);
    }
    throw new Error(`unexpected request ${input}`);
  });
  return wheres;
}

test('LIKE wildcards and quotes in the search match only themselves', async (t) => {
  const wheres = mockServices(t, {});

  await searchAudubonCircles("o'brien 50%_off\\");

  const term = "'%O''BRIEN 50\\%\\_OFF\\\\%' ESCAPE '\\'";
  assert.deepEqual(wheres, [`UPPER(Abbrev) LIKE ${term} OR UPPER(Name) LIKE ${term}`]);
});

test('a circle whose center is off the globe is left out of the results', async (t) => {
  mockServices(t, {
    query: () =>
      Response.json({
        features: [
          { attributes: BLOOMINGTON },
          { attributes: { ...BLOOMINGTON, Abbrev: 'MNBD', Latitude: 144.83 } },
          'not a feature',
        ],
      }),
  });

  const results = await searchAudubonCircles('MN');

  assert.deepEqual(
    results.map((r) => [r.code, r.source]),
    [['MNBL', 'audubon']]
  );
});

for (const [why, query] of [
  ['answers with an error status', () => new Response('busy', { status: 503 })],
  ['answers with a body that is not JSON', () => new Response('<html>maintenance</html>')],
  ['cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
  ['times out', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
] as const) {
  test(`the search falls back to place names when the circle layer ${why}`, async (t) => {
    mockServices(t, { query, nominatim: () => Response.json([NOMINATIM_PLACE]) });

    const results = await searchAudubonCircles('Isabella');

    assert.deepEqual(
      results.map((r) => [r.code, r.source, r.lat, r.lng]),
      [['MIISA', 'osm', 47.6186, -91.3564]]
    );
  });
}

test('an error that is not a request failure is not hidden by the fallback', async (t) => {
  mockServices(t, { query: () => Promise.reject(new RangeError('bug')) });

  await assert.rejects(searchAudubonCircles('Isabella'), RangeError);
});

test('a place list in an unexpected shape is reported instead of shown', async (t) => {
  mockServices(t, { nominatim: () => Response.json([{ ...NOMINATIM_PLACE, lat: 'north' }]) });

  await assert.rejects(
    searchAudubonCircles('Isabella'),
    (err) => err instanceof UnexpectedResponseError && err.source === 'nominatim'
  );
});

const AUDUBON_RESULT: AudubonCircleResult = {
  code: 'MNBL',
  name: 'Bloomington',
  state: 'MN',
  lat: 44.83,
  lng: -93.3,
  source: 'audubon',
  joinUrl: 'https://cbc.audubon.org/en/join',
};

for (const [why, fetchPage] of [
  ['answers with an error status', async () => new Response('down', { status: 503 })],
  ['cannot be reached', async () => Promise.reject(new TypeError('fetch failed'))],
] as const) {
  test(`page details are skipped when the Audubon page ${why}`, async (t) => {
    t.mock.method(globalThis, 'fetch', fetchPage);

    assert.equal(await withAudubonPageDetails(AUDUBON_RESULT), AUDUBON_RESULT);
  });
}

test('every circle, place, and page request uses the shared fetch timeout', async (t) => {
  mockServices(t, { nominatim: () => Response.json([NOMINATIM_PLACE]) });
  const timeout = t.mock.method(AbortSignal, 'timeout');

  await searchAudubonCircles('Isabella');
  const searchCalls = timeout.mock.callCount();
  await withAudubonPageDetails(AUDUBON_RESULT);

  assert.ok(searchCalls >= 2, 'the layer query and the place search each set a timeout');
  assert.equal(timeout.mock.callCount(), searchCalls + 1, 'the circle page sets a timeout');
  assert.ok(timeout.mock.calls.every((call) => call.arguments[0] === FETCH_TIMEOUT_MS));
});

test('page details do not hide an error that is not a request failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new RangeError('bug');
  });

  await assert.rejects(withAudubonPageDetails(AUDUBON_RESULT), RangeError);
});
