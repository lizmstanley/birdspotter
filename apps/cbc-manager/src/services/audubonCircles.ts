import { fetchAudubonCircleDetails } from './audubonCirclePage.ts';
import { isLatitude, isLongitude } from '@birdspotter/birding-core/coordinates.ts';
import {
  AudubonProxyUnavailableError,
  AudubonRequestError,
  AudubonUnreachableError,
} from './errors.ts';
import { UnexpectedResponseError } from '@birdspotter/birding-core/errors.ts';
import { FETCH_TIMEOUT_MS, isRecord, isRequestFailure } from '@birdspotter/birding-core/http.ts';

export interface AudubonCircleResult {
  code: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  source: 'audubon' | 'osm';
  joinUrl: string;
  compilerName?: string;
  compilerEmail?: string;
  countDate?: string;
  /** True when count date and compiler came from the Audubon circle page */
  hasAudubonPageDetails?: boolean;
}

interface ArcGisLayerMeta {
  url: string;
  codeField: string;
  nameField: string;
  stateField: string | null;
  latField: string | null;
  lngField: string | null;
  compilerNameField: string | null;
  compilerEmailField: string | null;
  countDateField: string | null;
}

const ARCGIS_QUERIES = [
  'type:"Feature Service" title:"Christmas Bird Count"',
  'type:"Feature Service" title:"CBC" "Audubon"',
];

// Public search also returns third-party copies of old counts; only Audubon's own accounts are trusted.
const AUDUBON_OWNER_SUFFIX = '_audubon';

let cachedLayerMeta: ArcGisLayerMeta | null = null;

/**
 * @returns the parsed body, or null when the request fails, times out, answers with an error status,
 *   or is not JSON. Every caller has a fallback source to move on to.
 */
async function fetchOptionalJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (err) {
    if (isRequestFailure(err)) return null;
    throw err;
  }
}

async function inspectFeatureLayer(serviceUrl: string): Promise<ArcGisLayerMeta | null> {
  const cleanUrl = serviceUrl.replace(/\/$/, '');
  const layerUrl = `${cleanUrl}/0`;
  const meta = await fetchOptionalJson(`${layerUrl}?f=json`);
  if (!isRecord(meta) || !Array.isArray(meta.fields)) return null;
  const names = meta.fields.flatMap((f: unknown) => (isRecord(f) && typeof f.name === 'string' ? [f.name] : []));
  const findField = (candidates: string[]) =>
    names.find((n) => candidates.some((c) => n.toLowerCase() === c.toLowerCase())) ?? null;

  const codeField = findField(['Abbrev', 'Circle_Code', 'CircleCode', 'CODE', 'CBC_Code']);
  const nameField = findField(['Name', 'Circle_Name', 'CircleName', 'NAME', 'CBC_Name']);
  if (!codeField || !nameField) return null;

  return {
    url: layerUrl,
    codeField,
    nameField,
    stateField: findField(['Subnational_code', 'State', 'STATE', 'State_Prov']),
    latField: findField(['Latitude', 'LAT', 'Center_Lat']),
    lngField: findField(['Longitude', 'LNG', 'LON', 'Center_Lng']),
    compilerNameField: findField(['Compiler', 'Compiler_Name', 'CompilerName', 'Contact_Name', 'ContactName', 'FirstName', 'First_Name']),
    compilerEmailField: findField(['Email', 'Compiler_Email', 'CompilerEmail', 'Contact_Email', 'EmailAddress', 'EmailAddre', 'Email_Address']),
    countDateField: findField(['Cnt_dt', 'Count_Date', 'CountDate', 'Date', 'CBC_Date', 'Cnt_Date', 'Current_Date']),
  };
}

async function discoverAudubonLayer(): Promise<ArcGisLayerMeta | null> {
  if (cachedLayerMeta) return cachedLayerMeta;

  for (const q of ARCGIS_QUERIES) {
    const searchUrl =
      'https://www.arcgis.com/sharing/rest/search?q=' +
      encodeURIComponent(q) +
      '&sortField=modified&sortOrder=desc&num=25&f=json';
    const data = await fetchOptionalJson(searchUrl);
    const items: unknown[] = isRecord(data) && Array.isArray(data.results) ? data.results : [];
    for (const item of items) {
      if (!isRecord(item) || typeof item.url !== 'string' || typeof item.owner !== 'string') continue;
      if (!/FeatureServer/i.test(item.url) || !item.owner.endsWith(AUDUBON_OWNER_SUFFIX)) continue;
      const inspected = await inspectFeatureLayer(item.url);
      if (inspected) {
        cachedLayerMeta = inspected;
        return inspected;
      }
    }
  }
  return null;
}

/** Escapes LIKE wildcards and quotes so the term matches only itself with `ESCAPE '\'`. */
function toLikeLiteral(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&').replace(/'/g, "''");
}

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, unknown>;
}

function isNominatimPlace(value: unknown): value is NominatimPlace {
  return (
    isRecord(value) &&
    typeof value.display_name === 'string' &&
    typeof value.lat === 'string' &&
    typeof value.lon === 'string' &&
    isLatitude(Number(value.lat)) &&
    isLongitude(Number(value.lon)) &&
    (value.address === undefined || isRecord(value.address))
  );
}

function addressText(place: NominatimPlace, key: string): string | undefined {
  const value = place.address?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

async function searchNominatimPlaces(query: string): Promise<AudubonCircleResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=' +
    encodeURIComponent(query.trim());
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data) || !data.every(isNominatimPlace)) {
    throw new UnexpectedResponseError('nominatim', 'search');
  }

  return data.map((item, idx) => {
    const shortName =
      addressText(item, 'city') ??
      addressText(item, 'town') ??
      addressText(item, 'village') ??
      item.display_name.split(',')[0];
    const state = addressText(item, 'state') ?? '';
    const codePrefix = (state.slice(0, 2) || 'US').toUpperCase();
    const codeSuffix = shortName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || `${idx + 1}`;
    return {
      code: `${codePrefix}${codeSuffix}`,
      name: item.display_name.split(',').slice(0, 2).join(', '),
      state,
      lat: Number(Number(item.lat).toFixed(5)),
      lng: Number(Number(item.lon).toFixed(5)),
      source: 'osm',
      joinUrl: 'https://cbc.audubon.org/en/join',
    };
  });
}

function textField(attrs: Record<string, unknown>, field: string | null): string {
  return field ? String(attrs[field] ?? '').trim() : '';
}

function compilerNameOf(layer: ArcGisLayerMeta, attrs: Record<string, unknown>): string {
  const name = textField(attrs, layer.compilerNameField);
  const lastName = attrs['LastName'] ?? attrs['Last_Name'];
  if (/^first_?name$/i.test(layer.compilerNameField ?? '') && lastName) {
    return `${name} ${String(lastName).trim()}`.trim();
  }
  return name;
}

function countDateOf(layer: ArcGisLayerMeta, attrs: Record<string, unknown>): string {
  if (!layer.countDateField || attrs[layer.countDateField] == null) return '';
  const rawDate = attrs[layer.countDateField];
  if (typeof rawDate === 'number' && rawDate > 100000000000) {
    return new Date(rawDate).toISOString().slice(0, 10);
  }
  return String(rawDate).trim();
}

function featureToResult(layer: ArcGisLayerMeta, feature: unknown): AudubonCircleResult | null {
  if (!isRecord(feature)) return null;
  const attrs = isRecord(feature.attributes) ? feature.attributes : {};
  const geometry = isRecord(feature.geometry) ? feature.geometry : {};
  const code = textField(attrs, layer.codeField).toUpperCase();
  const lat = Number((layer.latField ? attrs[layer.latField] : undefined) ?? geometry.y);
  const lng = Number((layer.lngField ? attrs[layer.lngField] : undefined) ?? geometry.x);
  if (!code || !isLatitude(lat) || !isLongitude(lng)) return null;

  return {
    code,
    name: textField(attrs, layer.nameField) || code,
    state: textField(attrs, layer.stateField),
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    source: 'audubon',
    joinUrl: 'https://cbc.audubon.org/en/join',
    compilerName: compilerNameOf(layer, attrs) || undefined,
    compilerEmail: textField(attrs, layer.compilerEmailField) || undefined,
    countDate: countDateOf(layer, attrs) || undefined,
  };
}

async function queryAudubonLayer(layer: ArcGisLayerMeta, term: string): Promise<AudubonCircleResult[]> {
  const pattern = `'%${toLikeLiteral(term)}%' ESCAPE '\\'`;
  const params = new URLSearchParams({
    where: `UPPER(${layer.codeField}) LIKE ${pattern} OR UPPER(${layer.nameField}) LIKE ${pattern}`,
    outFields: '*',
    outSR: '4326',
    returnGeometry: 'true',
    resultRecordCount: '20',
    f: 'json',
  });
  const data = await fetchOptionalJson(`${layer.url}/query?${params.toString()}`);
  const features: unknown[] = isRecord(data) && Array.isArray(data.features) ? data.features : [];
  return features.flatMap((f) => featureToResult(layer, f) ?? []);
}

function exactCodeFirstThenName(term: string) {
  return (a: AudubonCircleResult, b: AudubonCircleResult): number => {
    if (a.code === term && b.code !== term) return -1;
    if (b.code === term && a.code !== term) return 1;
    return a.name.localeCompare(b.name);
  };
}

export async function searchAudubonCircles(query: string): Promise<AudubonCircleResult[]> {
  const term = query.trim().toUpperCase();
  if (term.length < 2) return [];

  const layer = await discoverAudubonLayer();
  const results = layer ? await queryAudubonLayer(layer, term) : [];
  if (results.length > 0) return results.sort(exactCodeFirstThenName(term));

  // A place result still lets the user start a circle when Audubon has no match.
  return searchNominatimPlaces(query);
}

/**
 * Fills count date, compiler, center, and page link from the Audubon circle page.
 * Returns the result unchanged for place results, or when the page is unreachable or lacks the circle.
 */
export async function withAudubonPageDetails(result: AudubonCircleResult): Promise<AudubonCircleResult> {
  if (result.source !== 'audubon') return result;
  let details;
  try {
    details = await fetchAudubonCircleDetails(result.code);
  } catch (err) {
    // The ArcGIS data is still usable when the page cannot be reached.
    if (isPageUnreachable(err)) return result;
    throw err;
  }
  if (!details) return result;
  return {
    ...result,
    name: details.name,
    state: details.stateProvince ?? result.state,
    lat: details.lat,
    lng: details.lng,
    joinUrl: details.pageUrl,
    compilerName: details.compilerName ?? result.compilerName,
    compilerEmail: details.compilerEmail ?? result.compilerEmail,
    countDate: details.countDate ?? result.countDate,
    hasAudubonPageDetails: true,
  };
}

function isPageUnreachable(err: unknown): boolean {
  return (
    err instanceof AudubonProxyUnavailableError ||
    err instanceof AudubonRequestError ||
    err instanceof AudubonUnreachableError
  );
}
