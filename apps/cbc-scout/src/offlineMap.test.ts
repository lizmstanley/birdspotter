import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAP_STYLE_URL } from '@birdspotter/birding-core/basemap.ts';
import type { LngLatBox } from './areaOutline.ts';
import { tilesCoveringBox } from './mapTiles.ts';
import {
  deleteSavedMap,
  isSameBox,
  MAX_PARALLEL_REQUESTS,
  readSavedMapInfo,
  saveAreaMap,
  savedMapCacheName,
  savedMapKey,
  type MapDownloadProgress,
} from './offlineMap.ts';
import {
  MapFileRequestError,
  MapStyleFormatError,
  MapTooLargeError,
  MapTooManyTilesError,
  MapUnreachableError,
} from './offlineMapErrors.ts';

const HOST = 'https://tiles.openfreemap.org/';
const TILE_JSON_URL = `${HOST}planet`;
const VECTOR_TEMPLATE = `${HOST}planet/20261122_124456_pt/{z}/{x}/{y}.pbf`;
const RASTER_TEMPLATE = `${HOST}natural_earth/ne2sr/{z}/{x}/{y}.png`;
const BOX: LngLatBox = { west: -93.3, south: 44.9, east: -93.2, north: 45 };
const AREA_KEY = 'MNMI/12';

function style(overrides: Record<string, unknown> = {}) {
  return {
    version: 8,
    sprite: `${HOST}sprites/ofm`,
    glyphs: `${HOST}fonts/{fontstack}/{range}.pbf`,
    sources: {
      openmaptiles: { type: 'vector', url: TILE_JSON_URL },
      ne2_shaded: { type: 'raster', maxzoom: 6, tiles: [RASTER_TEMPLATE] },
    },
    layers: [
      { id: 'background', type: 'background' },
      { id: 'road-label', type: 'symbol', layout: { 'text-font': ['Noto Sans Regular'] } },
      { id: 'water-label', type: 'symbol', layout: { 'text-font': ['Noto Sans Italic'] } },
      { id: 'road-label-2', type: 'symbol', layout: { 'text-font': ['Noto Sans Regular'] } },
    ],
    ...overrides,
  };
}

interface FakeNetwork {
  readonly styleJson?: unknown;
  readonly tileJson?: unknown;
  readonly tileBytes?: number;
  readonly respond?: (url: string) => Response | null;
}

function fakeFetch(network: FakeNetwork = {}) {
  const requested: string[] = [];
  let inFlight = 0;
  let mostInFlight = 0;
  const fetchFile = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    requested.push(url);
    inFlight += 1;
    mostInFlight = Math.max(mostInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    const special = network.respond?.(url);
    if (special) return special;
    if (url === BASEMAP_STYLE_URL) return Response.json(network.styleJson ?? style());
    if (url === TILE_JSON_URL) {
      return Response.json(network.tileJson ?? { tiles: [VECTOR_TEMPLATE], minzoom: 0, maxzoom: 14 });
    }
    return new Response(new Uint8Array(network.tileBytes ?? 10), { headers: { 'content-type': 'application/x-protobuf' } });
  };
  return { fetch: fetchFile as typeof fetch, requested, mostInFlight: () => mostInFlight };
}

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const storage = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return { put: async (key: string, response: Response) => void store.set(key, response) };
    },
    delete: async (name: string) => stores.delete(name),
    match: async (key: string, { cacheName }: { cacheName: string }) => stores.get(cacheName)?.get(key)?.clone(),
  };
  return { caches: storage as unknown as CacheStorage, stores };
}

function download(network: ReturnType<typeof fakeFetch>, caches: CacheStorage, progress: MapDownloadProgress[] = []) {
  return saveAreaMap({
    areaKey: AREA_KEY,
    box: BOX,
    caches,
    fetch: network.fetch,
    signal: new AbortController().signal,
    onProgress: (step) => progress.push(step),
  });
}

function savedKeys(stores: Map<string, Map<string, Response>>): string[] {
  return [...(stores.get(savedMapCacheName(AREA_KEY))?.keys() ?? [])];
}

test("a download saves the style, its files, and every tile over the area's box", async () => {
  const network = fakeFetch();
  const { caches, stores } = fakeCaches();
  const info = await download(network, caches);
  const keys = savedKeys(stores);
  const vectorTiles = tilesCoveringBox(BOX, 0, 14).length;
  const rasterTiles = tilesCoveringBox(BOX, 0, 6).length;
  assert.equal(info.tileCount, vectorTiles + rasterTiles);
  for (const key of [
    BASEMAP_STYLE_URL,
    TILE_JSON_URL,
    `${HOST}sprites/ofm@2x.png`,
    `${HOST}fonts/Noto Sans Italic/8192-8447.pbf`,
    `${HOST}natural_earth/ne2sr/6/15/23.png`,
    `${HOST}cbc-scout-saved/vector/14/3945/5893.pbf`,
  ]) {
    assert.ok(keys.includes(key), key);
  }
  // Two font stacks, three ranges each, and four sprite files, beside the tiles, style, TileJSON, and details.
  assert.equal(keys.length, info.tileCount + 6 + 4 + 3);
  assert.deepEqual(await readSavedMapInfo(caches, AREA_KEY), info);
});

test('a download never runs more than four requests at once', async () => {
  const network = fakeFetch();
  await download(network, fakeCaches().caches);
  assert.equal(network.mostInFlight(), MAX_PARALLEL_REQUESTS);
});

test('a download reports progress up to every file', async () => {
  const progress: MapDownloadProgress[] = [];
  await download(fakeFetch(), fakeCaches().caches, progress);
  const last = progress.at(-1);
  assert.ok(last && last.total > 0);
  assert.equal(last.done, last.total);
  assert.equal(progress.length, last.total + 1);
});

test('an area over the tile limit stops before any tile is fetched', async () => {
  const network = fakeFetch({ tileJson: { tiles: [VECTOR_TEMPLATE], minzoom: 0, maxzoom: 18 } });
  const { caches, stores } = fakeCaches();
  await assert.rejects(download(network, caches), (error) => error instanceof MapTooManyTilesError && error.tileCount > 3000);
  assert.deepEqual(network.requested, [BASEMAP_STYLE_URL, TILE_JSON_URL]);
  assert.equal(stores.size, 0);
});

test('a download that would pass 50 MB stops and keeps nothing', async () => {
  const network = fakeFetch({ tileBytes: 2_000_000 });
  const { caches, stores } = fakeCaches();
  await assert.rejects(download(network, caches), MapTooLargeError);
  assert.equal(stores.size, 0);
  assert.ok(network.requested.length < 40);
  assert.equal(await readSavedMapInfo(caches, AREA_KEY), null);
});

test('a dropped signal stops the download as unreachable and keeps nothing', async () => {
  const network = fakeFetch({
    respond: (url) => {
      if (url.endsWith('/14/3947/5895.pbf')) throw new TypeError('Failed to fetch');
      return null;
    },
  });
  const { caches, stores } = fakeCaches();
  await assert.rejects(download(network, caches), MapUnreachableError);
  assert.equal(stores.size, 0);
});

test('a refused file stops the download with its status', async () => {
  const network = fakeFetch({
    respond: (url) => (url.includes('/fonts/') ? new Response('gone', { status: 404 }) : null),
  });
  await assert.rejects(download(network, fakeCaches().caches), (error) => error instanceof MapFileRequestError && error.status === 404);
});

test('a style that points off the map provider is refused before the file is fetched', async () => {
  const network = fakeFetch({ styleJson: style({ sprite: 'https://elsewhere.test/sprite' }) });
  await assert.rejects(download(network, fakeCaches().caches), MapStyleFormatError);
  assert.ok(!network.requested.some((url) => url.startsWith('https://elsewhere.test/')));
});

test('a new download replaces what was saved for the area', async () => {
  const { caches, stores } = fakeCaches();
  const old = await caches.open(savedMapCacheName(AREA_KEY));
  await old.put(`${HOST}cbc-scout-saved/vector/14/1/1.pbf`, new Response('old'));
  await download(fakeFetch(), caches);
  assert.ok(!savedKeys(stores).includes(`${HOST}cbc-scout-saved/vector/14/1/1.pbf`));
});

test('removing a saved map deletes its cache', async () => {
  const { caches, stores } = fakeCaches();
  await download(fakeFetch(), caches);
  assert.equal(await deleteSavedMap(caches, AREA_KEY), true);
  assert.equal(stores.has(savedMapCacheName(AREA_KEY)), false);
});

test('a box matches only a box with every side the same', () => {
  assert.equal(isSameBox(BOX, { ...BOX }), true);
  assert.equal(isSameBox(BOX, { ...BOX, north: 45.01 }), false);
});

test('a vector tile is saved under a key without the planet build', () => {
  assert.equal(
    savedMapKey(`${HOST}backup_planet/20261122_124456_pt/14/3945/5893.pbf`),
    `${HOST}cbc-scout-saved/vector/14/3945/5893.pbf`
  );
  assert.equal(savedMapKey(`${HOST}fonts/Noto Sans Regular/0-255.pbf`), `${HOST}fonts/Noto Sans Regular/0-255.pbf`);
  assert.equal(savedMapKey(`${HOST}natural_earth/ne2sr/6/15/23.png`), `${HOST}natural_earth/ne2sr/6/15/23.png`);
});
