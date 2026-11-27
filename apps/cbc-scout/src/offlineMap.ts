import { BASEMAP_STYLE_URL } from '@birdspotter/birding-core/basemap.ts';
import { isRecord } from '@birdspotter/birding-core/http.ts';
import type { LngLatBox } from './areaOutline.ts';
import { tilesCoveringBox, tileUrl, type TileAddress } from './mapTiles.ts';
import {
  MapFileRequestError,
  MapStorageError,
  MapStyleFormatError,
  MapTooLargeError,
  MapTooManyTilesError,
  MapUnreachableError,
} from './offlineMapErrors.ts';

// OpenFreeMap's offline download terms. Bytes are counted as stored, after the browser decompresses them, which is
// never less than what crosses the wire.
export const MAX_TILES_PER_DOWNLOAD = 3000;
export const MAX_BYTES_PER_DOWNLOAD = 50_000_000;
export const MAX_PARALLEL_REQUESTS = 4;

const MAP_HOST = 'https://tiles.openfreemap.org/';
// sw.js reads every cache with this prefix and builds saved keys the same way. Change both together.
const MAP_CACHE_PREFIX = 'cbc-scout-map-v1:';
const SAVED_VECTOR_TILE_BASE = `${MAP_HOST}cbc-scout-saved/vector/`;
const VECTOR_TILE_PATH = /\/(\d+\/\d+\/\d+\.pbf)$/;
const SAVED_MAP_INFO_KEY = `${MAP_HOST}cbc-scout-saved/map.json`;

// Glyphs load per 256 characters, and the labels are unknown until drawn: Latin, Latin Extended-A, and punctuation.
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];
const SPRITE_SUFFIXES = ['.json', '.png', '@2x.json', '@2x.png'];
const DEFAULT_MAX_ZOOM = 22;
const UNKNOWN_PLACEHOLDER = /\{(?![zxy]\})[^}]*\}/;

export interface SavedMapInfo {
  /** The box the map covers. */
  readonly box: LngLatBox;
  readonly savedAt: string;
  readonly tileCount: number;
  readonly byteCount: number;
}

export interface MapDownloadProgress {
  readonly done: number;
  readonly total: number;
}

export interface MapDownloadOptions {
  readonly areaKey: string;
  readonly box: LngLatBox;
  readonly caches: CacheStorage;
  readonly fetch: typeof fetch;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: MapDownloadProgress) => void;
}

interface TileSource {
  readonly templates: readonly string[];
  readonly minZoom: number;
  readonly maxZoom: number;
}

interface MapFile {
  readonly body: ArrayBuffer;
  readonly contentType: string;
}

/** @returns null where the browser has no Cache API, as on a page not served over HTTPS */
export function browserCaches(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

export function savedMapCacheName(areaKey: string): string {
  return `${MAP_CACHE_PREFIX}${areaKey}`;
}

/**
 * Vector tiles are saved under a key without the planet build in their URL, so a TileJSON saved with any area reaches
 * every saved area's tiles.
 */
export function savedMapKey(url: string): string {
  const tilePath = new URL(url).pathname.match(VECTOR_TILE_PATH);
  return tilePath ? `${SAVED_VECTOR_TILE_BASE}${tilePath[1]}` : url;
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function jsonRecord(file: MapFile, part: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(file.body));
  } catch (error) {
    throw new MapStyleFormatError(part, error);
  }
  if (!isRecord(parsed)) throw new MapStyleFormatError(part);
  return parsed;
}

function spriteBases(sprite: unknown): string[] {
  if (sprite === undefined) return [];
  if (typeof sprite === 'string') return [sprite];
  const bases = Array.isArray(sprite) ? stringList(sprite.map((entry) => (isRecord(entry) ? entry.url : null))) : null;
  if (!bases) throw new MapStyleFormatError('sprite');
  return bases;
}

function spriteUrls(sprite: unknown): string[] {
  return spriteBases(sprite).flatMap((base) => SPRITE_SUFFIXES.map((suffix) => `${base}${suffix}`));
}

function glyphUrls(style: Record<string, unknown>): string[] {
  if (typeof style.glyphs !== 'string') return [];
  const template = style.glyphs;
  const layers = Array.isArray(style.layers) ? style.layers : [];
  const fontStacks = new Set<string>();
  for (const layer of layers) {
    const fonts = isRecord(layer) && isRecord(layer.layout) ? stringList(layer.layout['text-font']) : null;
    if (fonts) fontStacks.add(fonts.join(','));
  }
  return [...fontStacks].flatMap((stack) =>
    GLYPH_RANGES.map((range) => template.replace('{fontstack}', stack).replace('{range}', range))
  );
}

function tileSourceOf(source: Record<string, unknown>, tileJson: Record<string, unknown> | null): TileSource {
  const spec = tileJson ?? source;
  const templates = stringList(spec.tiles);
  if (!templates || templates.length === 0 || templates.some((template) => UNKNOWN_PLACEHOLDER.test(template))) {
    throw new MapStyleFormatError('tile source');
  }
  return {
    templates,
    minZoom: numberOr(source.minzoom, numberOr(spec.minzoom, 0)),
    maxZoom: numberOr(source.maxzoom, numberOr(spec.maxzoom, DEFAULT_MAX_ZOOM)),
  };
}

/** MapLibre spreads a source's tiles over its URLs by column and row, so the saved URL is the one it will ask for. */
function sourceTileUrl(source: TileSource, tile: TileAddress): string {
  return tileUrl(source.templates[(tile.x + tile.y) % source.templates.length], tile);
}

function tileUrls(sources: readonly TileSource[], box: LngLatBox): string[] {
  return sources.flatMap((source) =>
    tilesCoveringBox(box, source.minZoom, source.maxZoom).map((tile) => sourceTileUrl(source, tile))
  );
}

async function fetchMapFile(fetchFile: typeof fetch, url: string, signal: AbortSignal): Promise<MapFile> {
  if (!url.startsWith(MAP_HOST)) throw new MapStyleFormatError('file address');
  try {
    const response = await fetchFile(url, { signal });
    if (response.status !== 200) throw new MapFileRequestError(url, response.status);
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    return { body: await response.arrayBuffer(), contentType };
  } catch (error) {
    if (error instanceof TypeError) throw new MapUnreachableError(error);
    throw error;
  }
}

async function putFile(cache: Cache, key: string, body: ArrayBuffer | string, contentType: string): Promise<void> {
  try {
    await cache.put(key, new Response(body, { headers: { 'content-type': contentType } }));
  } catch (error) {
    throw new MapStorageError(error);
  }
}

/** Runs each task with at most `limit` running at once, and stops starting new ones after the first failure. */
async function runLimited<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let hasFailed = false;
  async function runNext(): Promise<void> {
    while (!hasFailed && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await task(item);
      } catch (error) {
        hasFailed = true;
        throw error;
      }
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runNext);
  const results = await Promise.allSettled(runners);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function downloadInto(cache: Cache, options: MapDownloadOptions): Promise<SavedMapInfo> {
  const fetchFile = (url: string) => fetchMapFile(options.fetch, url, options.signal);
  let byteCount = 0;
  async function save(url: string, file: MapFile): Promise<void> {
    if (byteCount + file.body.byteLength > MAX_BYTES_PER_DOWNLOAD) throw new MapTooLargeError(MAX_BYTES_PER_DOWNLOAD);
    byteCount += file.body.byteLength;
    await putFile(cache, savedMapKey(url), file.body, file.contentType);
  }

  const styleFile = await fetchFile(BASEMAP_STYLE_URL);
  const style = jsonRecord(styleFile, 'style');
  await save(BASEMAP_STYLE_URL, styleFile);
  const sources = isRecord(style.sources) ? Object.values(style.sources).filter(isRecord) : [];
  const tileSources: TileSource[] = [];
  for (const source of sources) {
    if (source.type !== 'vector' && source.type !== 'raster') continue;
    if (typeof source.url !== 'string') {
      tileSources.push(tileSourceOf(source, null));
      continue;
    }
    const tileJsonFile = await fetchFile(source.url);
    tileSources.push(tileSourceOf(source, jsonRecord(tileJsonFile, 'tile source')));
    await save(source.url, tileJsonFile);
  }

  const tiles = tileUrls(tileSources, options.box);
  if (tiles.length > MAX_TILES_PER_DOWNLOAD) throw new MapTooManyTilesError(tiles.length);
  const files = [...spriteUrls(style.sprite), ...glyphUrls(style), ...tiles];
  let done = 0;
  options.onProgress({ done, total: files.length });
  await runLimited(files, MAX_PARALLEL_REQUESTS, async (url) => {
    await save(url, await fetchFile(url));
    done += 1;
    options.onProgress({ done, total: files.length });
  });

  const info: SavedMapInfo = { box: options.box, savedAt: new Date().toISOString(), tileCount: tiles.length, byteCount };
  // Written last, so a map is saved only once every file is.
  await putFile(cache, SAVED_MAP_INFO_KEY, JSON.stringify(info), 'application/json');
  return info;
}

/**
 * Downloads the street map for the box into the area's own cache, replacing any map saved for it. On failure it
 * removes what it stored, so an area has a whole map or none.
 */
export async function saveAreaMap(options: MapDownloadOptions): Promise<SavedMapInfo> {
  const cacheName = savedMapCacheName(options.areaKey);
  try {
    await options.caches.delete(cacheName);
    return await downloadInto(await options.caches.open(cacheName), options);
  } catch (error) {
    await options.caches.delete(cacheName).catch(() => undefined);
    if (error instanceof DOMException && error.name !== 'AbortError') throw new MapStorageError(error);
    throw error;
  }
}

function isLngLatBox(value: unknown): value is LngLatBox {
  return isRecord(value) && ['west', 'south', 'east', 'north'].every((side) => typeof value[side] === 'number');
}

export function isSameBox(a: LngLatBox, b: LngLatBox): boolean {
  return a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north;
}

function isSavedMapInfo(value: unknown): value is SavedMapInfo {
  return (
    isRecord(value) &&
    isLngLatBox(value.box) &&
    typeof value.savedAt === 'string' &&
    typeof value.tileCount === 'number' &&
    typeof value.byteCount === 'number'
  );
}

/** @returns the saved map's details, or null when the area has no whole map saved or the Cache API is blocked */
export async function readSavedMapInfo(caches: CacheStorage, areaKey: string): Promise<SavedMapInfo | null> {
  try {
    const saved = await caches.match(SAVED_MAP_INFO_KEY, { cacheName: savedMapCacheName(areaKey) });
    if (!saved) return null;
    const info: unknown = await saved.json();
    return isSavedMapInfo(info) ? info : null;
  } catch {
    return null;
  }
}

/** @returns false when the Cache API is blocked */
export async function deleteSavedMap(caches: CacheStorage, areaKey: string): Promise<boolean> {
  try {
    await caches.delete(savedMapCacheName(areaKey));
    return true;
  } catch {
    return false;
  }
}
