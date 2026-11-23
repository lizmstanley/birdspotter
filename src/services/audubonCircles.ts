/**
 * CBC circle search: Audubon's ArcGIS circle layer, then OpenStreetMap Nominatim places.
 * `withAudubonPageDetails` fills count date and compiler from the Audubon circle page.
 * Decoupled for reuse in Aviscout.
 */
import { fetchAudubonCircleDetails } from './audubonCirclePage';

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

async function inspectFeatureLayer(serviceUrl: string): Promise<ArcGisLayerMeta | null> {
  const cleanUrl = serviceUrl.replace(/\/$/, '');
  const layerUrl = `${cleanUrl}/0`;
  try {
    const res = await fetch(`${layerUrl}?f=json`);
    if (!res.ok) return null;
    const meta = (await res.json()) as {
      fields?: Array<{ name: string }>;
    };
    const names = (meta.fields ?? []).map((f) => f.name);
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
  } catch {
    return null;
  }
}

async function discoverAudubonLayer(): Promise<ArcGisLayerMeta | null> {
  if (cachedLayerMeta) return cachedLayerMeta;

  for (const q of ARCGIS_QUERIES) {
    try {
      const searchUrl =
        'https://www.arcgis.com/sharing/rest/search?q=' +
        encodeURIComponent(q) +
        '&sortField=modified&sortOrder=desc&num=25&f=json';
      const res = await fetch(searchUrl);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<{ url?: string; owner?: string }>;
      };
      for (const item of data.results ?? []) {
        if (!item.url || !/FeatureServer/i.test(item.url)) continue;
        if (!item.owner?.endsWith(AUDUBON_OWNER_SUFFIX)) continue;
        const inspected = await inspectFeatureLayer(item.url);
        if (inspected) {
          cachedLayerMeta = inspected;
          return inspected;
        }
      }
    } catch {
      // Try next query
    }
  }
  return null;
}

function escapeSqlLike(input: string): string {
  return input.replace(/'/g, "''").trim().toUpperCase();
}

async function searchNominatimPlaces(query: string): Promise<AudubonCircleResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=' +
    encodeURIComponent(query.trim());
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: { state?: string; town?: string; city?: string; village?: string };
  }>;

  return data.map((item, idx) => {
    const shortName =
      item.address?.city ||
      item.address?.town ||
      item.address?.village ||
      item.display_name.split(',')[0];
    const state = item.address?.state ?? '';
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

export async function searchAudubonCircles(query: string): Promise<AudubonCircleResult[]> {
  const cleaned = escapeSqlLike(query);
  if (cleaned.length < 2) return [];

  const layer = await discoverAudubonLayer();
  if (layer) {
    const where = `UPPER(${layer.codeField}) LIKE '%${cleaned}%' OR UPPER(${layer.nameField}) LIKE '%${cleaned}%'`;
    const params = new URLSearchParams({
      where,
      outFields: '*',
      outSR: '4326',
      returnGeometry: 'true',
      resultRecordCount: '20',
      f: 'json',
    });

    try {
      const res = await fetch(`${layer.url}/query?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{
            attributes?: Record<string, unknown>;
            geometry?: { x?: number; y?: number };
          }>;
        };

        const results: AudubonCircleResult[] = [];
        for (const f of data.features ?? []) {
          const attrs = f.attributes ?? {};
          const code = String(attrs[layer.codeField] ?? '').trim().toUpperCase();
          const name = String(attrs[layer.nameField] ?? '').trim();
          const state = layer.stateField ? String(attrs[layer.stateField] ?? '').trim() : '';
          const lat = Number((layer.latField ? attrs[layer.latField] : undefined) ?? f.geometry?.y);
          const lng = Number((layer.lngField ? attrs[layer.lngField] : undefined) ?? f.geometry?.x);
          if (!code || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          let compilerName = layer.compilerNameField
            ? String(attrs[layer.compilerNameField] ?? '').trim()
            : '';
          const lastName = attrs['LastName'] ?? attrs['Last_Name'];
          if (/^first_?name$/i.test(layer.compilerNameField ?? '') && lastName) {
            compilerName = `${compilerName} ${String(lastName).trim()}`.trim();
          }
          const compilerEmail = layer.compilerEmailField
            ? String(attrs[layer.compilerEmailField] ?? '').trim()
            : '';
          let countDate = '';
          if (layer.countDateField && attrs[layer.countDateField] != null) {
            const rawDate = attrs[layer.countDateField];
            if (typeof rawDate === 'number' && rawDate > 100000000000) {
              countDate = new Date(rawDate).toISOString().slice(0, 10);
            } else {
              countDate = String(rawDate).trim();
            }
          }

          results.push({
            code,
            name: name || code,
            state,
            lat: Number(lat.toFixed(5)),
            lng: Number(lng.toFixed(5)),
            source: 'audubon',
            joinUrl: 'https://cbc.audubon.org/en/join',
            compilerName: compilerName || undefined,
            compilerEmail: compilerEmail || undefined,
            countDate: countDate || undefined,
          });
        }

        if (results.length > 0) {
          return results.sort((a, b) => {
            if (a.code === cleaned && b.code !== cleaned) return -1;
            if (b.code === cleaned && a.code !== cleaned) return 1;
            return a.name.localeCompare(b.name);
          });
        }
      }
    } catch {
      // Fall through to Nominatim place search
    }
  }

  // Fallback: OpenStreetMap Nominatim place lookup so users are never blocked
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
  } catch {
    // Best effort: the ArcGIS data is still usable when the page cannot be reached.
    return result;
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
