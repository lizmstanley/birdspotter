/**
 * Client-side KML, KMZ & GeoJSON parser for CBC area boundaries.
 * Extracts KML <Style>/<StyleMap> fill & stroke colors when present,
 * and falls back to a curated distinct cartographic palette.
 * Intentionally decoupled from PGlite so it can be reused directly in Aviscout.
 */
import { strFromU8, unzipSync } from 'fflate';

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'Point';
  coordinates: unknown;
}

export interface ParsedAreaBoundary {
  code: string;
  name: string;
  description: string;
  geometry: GeoJsonGeometry;
  fillColor?: string;
  strokeColor?: string;
  isOuterCircle?: boolean;
}

const DISTINCT_PALETTE: Array<{ fill: string; stroke: string }> = [
  { fill: '#2563eb', stroke: '#1d4ed8' }, // Royal Blue
  { fill: '#16a34a', stroke: '#15803d' }, // Emerald Green
  { fill: '#ea580c', stroke: '#c2410c' }, // Burnt Orange
  { fill: '#9333ea', stroke: '#7e22ce' }, // Purple
  { fill: '#0891b2', stroke: '#0e7490' }, // Teal
  { fill: '#db2777', stroke: '#be185d' }, // Magenta
  { fill: '#ca8a04', stroke: '#a16207' }, // Gold
  { fill: '#dc2626', stroke: '#b91c1c' }, // Crimson
  { fill: '#4f46e5', stroke: '#4338ca' }, // Indigo
  { fill: '#65a30d', stroke: '#4d7c0f' }, // Olive Lime
  { fill: '#0284c7', stroke: '#0369a1' }, // Sky Blue
  { fill: '#d97706', stroke: '#b45309' }, // Amber
  { fill: '#c026d3', stroke: '#a21caf' }, // Fuchsia
  { fill: '#059669', stroke: '#047857' }, // Jade
  { fill: '#e11d48', stroke: '#be123c' }, // Rose
  { fill: '#475569', stroke: '#334155' }, // Slate
];

export function getPaletteColorForCode(code: string, index = 0): { fill: string; stroke: string } {
  let hash = index;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return DISTINCT_PALETTE[hash % DISTINCT_PALETTE.length];
}

/**
 * Convert KML color (aabbggrr) to standard CSS hex (#rrggbb).
 */
function kmlColorToHex(kmlColor: string | null | undefined): string | null {
  if (!kmlColor) return null;
  const clean = kmlColor.trim().replace(/^#/, '');
  if (clean.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(clean)) return null;
  const bb = clean.slice(2, 4);
  const gg = clean.slice(4, 6);
  const rr = clean.slice(6, 8);
  return `#${rr}${gg}${bb}`.toLowerCase();
}

function isOuterCircleName(name: string): boolean {
  return /full\s+.*cbc|circle\s*boundary|15[- ]?mile|outer\s*circle/i.test(name);
}

function extractAreaCode(rawName: string, fallbackIndex: number): string {
  const trimmed = rawName.trim();
  if (!trimmed) return `A${fallbackIndex + 1}`;

  // Match "Area #12", "Area 12", "Sector 4N", "Zone 3E", or leading "12 - Richfield"
  const labeled = trimmed.match(/^(?:area|sector|zone|territory)\s*#?\s*([0-9]{1,2}[A-Za-z]?)\b/i);
  if (labeled) return labeled[1].toUpperCase();

  const leading = trimmed.match(/^([0-9]{1,2}[A-Za-z]?)(?:\s*[-:\u2013\u2014]|$)/);
  if (leading) return leading[1].toUpperCase();

  return trimmed.slice(0, 28);
}

function parseCoordinateString(coordText: string): [number, number][] {
  const coords: [number, number][] = [];
  const tokens = coordText.trim().split(/\s+/);
  for (const token of tokens) {
    const parts = token.split(',');
    if (parts.length < 2) continue;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      coords.push([lng, lat]);
    }
  }
  return coords;
}

function parseKmlPolygon(polyEl: Element): [number, number][][] | null {
  const rings: [number, number][][] = [];

  const outerCoords = polyEl.querySelector('outerBoundaryIs coordinates');
  if (!outerCoords?.textContent) return null;
  const outerRing = parseCoordinateString(outerCoords.textContent);
  if (outerRing.length < 3) return null;
  rings.push(outerRing);

  const innerEls = polyEl.querySelectorAll('innerBoundaryIs coordinates');
  innerEls.forEach((el) => {
    if (el.textContent) {
      const hole = parseCoordinateString(el.textContent);
      if (hole.length >= 3) rings.push(hole);
    }
  });

  return rings;
}

function buildKmlStyleLookup(doc: Document): Map<string, { fill?: string; stroke?: string }> {
  const styles = new Map<string, { fill?: string; stroke?: string }>();

  Array.from(doc.getElementsByTagName('Style')).forEach((el) => {
    const id = el.getAttribute('id');
    if (!id) return;
    const polyColor = kmlColorToHex(el.querySelector('PolyStyle > color')?.textContent);
    const lineColor = kmlColorToHex(el.querySelector('LineStyle > color')?.textContent);
    styles.set(`#${id}`, {
      fill: polyColor ?? undefined,
      stroke: lineColor ?? undefined,
    });
  });

  // Resolve StyleMap -> normal Style
  Array.from(doc.getElementsByTagName('StyleMap')).forEach((el) => {
    const id = el.getAttribute('id');
    if (!id) return;
    const pairs = Array.from(el.getElementsByTagName('Pair'));
    const normalPair = pairs.find(
      (p) => p.getElementsByTagName('key')[0]?.textContent?.trim() === 'normal'
    );
    const styleUrl = normalPair?.getElementsByTagName('styleUrl')[0]?.textContent?.trim();
    if (styleUrl && styles.has(styleUrl)) {
      styles.set(`#${id}`, styles.get(styleUrl)!);
    }
  });

  return styles;
}

export function parseKmlText(kmlText: string): ParsedAreaBoundary[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid KML XML file.');
  }

  const styleMap = buildKmlStyleLookup(doc);
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  const results: ParsedAreaBoundary[] = [];

  placemarks.forEach((pm, idx) => {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() ?? '';
    const description = pm.getElementsByTagName('description')[0]?.textContent?.trim() ?? '';
    const code = extractAreaCode(name, idx);
    const outerCircle = isOuterCircleName(name);

    const styleUrl = pm.getElementsByTagName('styleUrl')[0]?.textContent?.trim() ?? '';
    const kmlStyle = styleMap.get(styleUrl);
    const fallback = getPaletteColorForCode(code, idx);

    const fillColor = outerCircle ? '#000000' : (kmlStyle?.fill ?? fallback.fill);
    const strokeColor = outerCircle ? '#1e293b' : (kmlStyle?.stroke ?? fallback.stroke);

    const polygons = Array.from(pm.getElementsByTagName('Polygon'));
    if (polygons.length === 1) {
      const rings = parseKmlPolygon(polygons[0]);
      if (rings) {
        results.push({
          code,
          name: name || code,
          description,
          geometry: { type: 'Polygon', coordinates: rings },
          fillColor,
          strokeColor,
          isOuterCircle: outerCircle,
        });
      }
      return;
    }

    if (polygons.length > 1) {
      const multiCoords = polygons
        .map(parseKmlPolygon)
        .filter((r): r is [number, number][][] => r !== null);
      if (multiCoords.length > 0) {
        results.push({
          code,
          name: name || code,
          description,
          geometry: { type: 'MultiPolygon', coordinates: multiCoords },
          fillColor,
          strokeColor,
          isOuterCircle: outerCircle,
        });
      }
      return;
    }

    const lineCoords = pm.querySelector('LineString coordinates')?.textContent;
    if (lineCoords) {
      const coords = parseCoordinateString(lineCoords);
      if (coords.length >= 2) {
        results.push({
          code,
          name: name || code,
          description,
          geometry: { type: 'LineString', coordinates: coords },
          fillColor,
          strokeColor,
          isOuterCircle: outerCircle,
        });
      }
    }
  });

  return results;
}

export function parseKmzBuffer(buffer: ArrayBuffer): ParsedAreaBoundary[] {
  const entries = unzipSync(new Uint8Array(buffer));
  const kmlNames = Object.keys(entries).filter((name) => name.toLowerCase().endsWith('.kml'));

  if (kmlNames.length === 0) {
    throw new Error('No .kml file found inside the .kmz archive.');
  }

  const primary =
    kmlNames.find((n) => n.toLowerCase() === 'doc.kml') ??
    kmlNames.find((n) => n.toLowerCase().endsWith('/doc.kml')) ??
    kmlNames[0];

  const kmlText = strFromU8(entries[primary]);
  return parseKmlText(kmlText);
}

export function parseGeoJsonText(jsonText: string): ParsedAreaBoundary[] {
  const parsed = JSON.parse(jsonText) as {
    type?: string;
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: GeoJsonGeometry;
    }>;
  };

  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('GeoJSON must be a FeatureCollection.');
  }

  const results: ParsedAreaBoundary[] = [];
  parsed.features.forEach((f, idx) => {
    if (!f.geometry) return;
    if (!['Polygon', 'MultiPolygon', 'LineString'].includes(f.geometry.type)) return;
    const props = f.properties ?? {};
    const rawName = String(props.name ?? props.Name ?? props.area ?? props.code ?? '').trim();
    const description = String(props.description ?? props.Description ?? '').trim();
    const code = extractAreaCode(rawName, idx);
    const outerCircle = isOuterCircleName(rawName);
    const fallback = getPaletteColorForCode(code, idx);

    results.push({
      code,
      name: rawName || code,
      description,
      geometry: f.geometry,
      fillColor: outerCircle ? '#000000' : fallback.fill,
      strokeColor: outerCircle ? '#1e293b' : fallback.stroke,
      isOuterCircle: outerCircle,
    });
  });

  return results;
}

export function computeGeometryCenter(geometry: GeoJsonGeometry): [number, number] | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  function visit(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords as [number, number];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of coords) visit(child);
  }

  visit(geometry.coordinates);
  if (!Number.isFinite(minLng)) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

export function computeCollectionCenter(boundaries: ParsedAreaBoundary[]): [number, number] | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  function visit(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords as [number, number];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of coords) visit(child);
  }

  for (const b of boundaries) {
    visit(b.geometry.coordinates);
  }
  if (!Number.isFinite(minLng)) return null;
  return [Number(((minLng + maxLng) / 2).toFixed(5)), Number(((minLat + maxLat) / 2).toFixed(5))];
}
