import {
  EBIRD_SITE_URL,
  buildCirclePolygon,
  ebirdChecklistUrl,
  type EbirdHotspot,
  type EbirdObservation,
} from '@birdspotter/birding-core/ebird.ts';
import type { GeoJsonGeometry } from '../../services/kmlParser.ts';
import { buildAreaFeatures } from './areaFeatures.ts';
import type { WithArea } from './EbirdTables.tsx';
import { areaDisplayName, areaLabel, escapeHtml } from './mapText.ts';
import type { AreaBoundaryItem } from './types.ts';

type Position = readonly number[];

export interface KmlCircle {
  readonly lat: number;
  readonly lng: number;
  readonly radiusMiles: number;
}

export interface MapKmlInput {
  readonly title: string;
  readonly circle: KmlCircle | null;
  readonly areas: readonly AreaBoundaryItem[];
  readonly notCountedAreaCodes: readonly string[];
  readonly hotspots: readonly WithArea<EbirdHotspot>[];
  readonly sightings: readonly WithArea<EbirdObservation>[];
}

const CIRCLE_STYLE_ID = 'circle';
const HOTSPOT_STYLE_ID = 'hotspot';
const SIGHTING_STYLE_ID = 'sighting';
const EBIRD_CREDIT_HTML = `<p>Data: <a href="${EBIRD_SITE_URL}">eBird.org</a></p>`;

/** @returns `#rrggbb` with an opacity as KML's `aabbggrr` */
export function toKmlColor(hex: string, opacity: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`kmlExport: not a #rrggbb color: ${hex}`);
  const [, r, g, b] = match;
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${alpha}${b}${g}${r}`.toLowerCase();
}

function coordinatesText(positions: readonly Position[]): string {
  return positions.map(([lng, lat]) => `${lng},${lat}`).join(' ');
}

function polygonKml(rings: readonly (readonly Position[])[]): string {
  const [outer, ...holes] = rings;
  const inner = holes
    .map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${coordinatesText(ring)}</coordinates></LinearRing></innerBoundaryIs>`)
    .join('');
  return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinatesText(outer)}</coordinates></LinearRing></outerBoundaryIs>${inner}</Polygon>`;
}

function geometryKml(geometry: GeoJsonGeometry): string {
  switch (geometry.type) {
    case 'Point':
      return `<Point><coordinates>${coordinatesText([geometry.coordinates as Position])}</coordinates></Point>`;
    case 'LineString':
      return `<LineString><coordinates>${coordinatesText(geometry.coordinates as Position[])}</coordinates></LineString>`;
    case 'Polygon':
      return polygonKml(geometry.coordinates as Position[][]);
    case 'MultiPolygon':
      return `<MultiGeometry>${(geometry.coordinates as Position[][][]).map(polygonKml).join('')}</MultiGeometry>`;
  }
}

function placemark(name: string, styleId: string, geometry: string, descriptionHtml?: string): string {
  const description = descriptionHtml ? `<description>${escapeHtml(descriptionHtml)}</description>` : '';
  return `<Placemark><name>${escapeHtml(name)}</name>${description}<styleUrl>#${styleId}</styleUrl>${geometry}</Placemark>`;
}

function pointKml(lng: number, lat: number): string {
  return `<Point><coordinates>${lng},${lat}</coordinates></Point>`;
}

function folder(name: string, placemarks: readonly string[]): string {
  if (placemarks.length === 0) return '';
  return `<Folder><name>${escapeHtml(name)}</name>${placemarks.join('')}</Folder>`;
}

function iconStyle(id: string, color: string, iconHref: string): string {
  return `<Style id="${id}"><IconStyle><color>${color}</color><Icon><href>${iconHref}</href></Icon></IconStyle></Style>`;
}

function circleFolder(circle: KmlCircle | null): string {
  if (!circle) return '';
  const outline = buildCirclePolygon(circle.lng, circle.lat, circle.radiusMiles).geometry;
  return folder('Count Circle', [
    placemark(`${circle.radiusMiles * 2}-mile circle`, CIRCLE_STYLE_ID, geometryKml(outline as GeoJsonGeometry)),
    placemark('Circle center', CIRCLE_STYLE_ID, pointKml(circle.lng, circle.lat)),
  ]);
}

function areasKml(areas: readonly AreaBoundaryItem[], notCountedAreaCodes: readonly string[]) {
  const features = buildAreaFeatures(areas, notCountedAreaCodes);
  const styles = features.map(
    ({ id, properties: p }) =>
      `<Style id="area-${id}"><LineStyle><color>${toKmlColor(p.strokeColor, 1)}</color><width>${p.lineWidth}</width></LineStyle><PolyStyle><color>${toKmlColor(p.fillColor, p.fillOpacity)}</color></PolyStyle></Style>`
  );
  const placemarks = features.map(({ id, properties: p, geometry }) =>
    placemark(
      areaDisplayName(p.code),
      `area-${id}`,
      geometryKml(geometry),
      p.label && p.label !== p.code ? `<p>${escapeHtml(p.label)}</p>` : undefined
    )
  );
  return { styles, folder: folder('Areas', placemarks) };
}

function areaLineHtml(area: string | null, hasAreas: boolean): string {
  return hasAreas ? `<p>Area: ${escapeHtml(areaLabel(area))}</p>` : '';
}

function hotspotPlacemark(h: WithArea<EbirdHotspot>, hasAreas: boolean): string {
  const description =
    `<p>All-time species: ${h.numSpeciesAllTime ?? '—'}</p>` +
    (h.latestObsDt ? `<p>Latest obs: ${escapeHtml(h.latestObsDt)}</p>` : '') +
    areaLineHtml(h.area, hasAreas) +
    `<p><a href="${EBIRD_SITE_URL}/hotspot/${encodeURIComponent(h.locId)}">Open in eBird</a></p>` +
    EBIRD_CREDIT_HTML;
  return placemark(h.locName, HOTSPOT_STYLE_ID, pointKml(h.lng, h.lat), description);
}

function sightingPlacemark(s: WithArea<EbirdObservation>, hasAreas: boolean): string {
  const description =
    `<p><em>${escapeHtml(s.sciName)}</em></p>` +
    `<p>Count: ${escapeHtml(s.howMany !== undefined ? String(s.howMany) : 'X (present)')}</p>` +
    `<p>Location: ${escapeHtml(s.locName)}</p>` +
    `<p>Date: ${escapeHtml(s.obsDt)}</p>` +
    areaLineHtml(s.area, hasAreas) +
    `<p><a href="${ebirdChecklistUrl(s.subId)}">View checklist</a></p>` +
    EBIRD_CREDIT_HTML;
  return placemark(s.comName, SIGHTING_STYLE_ID, pointKml(s.lng, s.lat), description);
}

/** @returns a KML document of the given circle, areas, hotspots, and sightings, one folder per layer */
export function buildMapKml(input: MapKmlInput): string {
  const hasAreas = input.areas.length > 0;
  const areas = areasKml(input.areas, input.notCountedAreaCodes);
  const styles = [
    `<Style id="${CIRCLE_STYLE_ID}"><LineStyle><color>${toKmlColor('#1d4ed8', 1)}</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>`,
    iconStyle(HOTSPOT_STYLE_ID, toKmlColor('#059669', 1), 'https://maps.google.com/mapfiles/kml/shapes/binoculars.png'),
    iconStyle(SIGHTING_STYLE_ID, toKmlColor('#d97706', 1), 'https://maps.google.com/mapfiles/kml/shapes/birds.png'),
    ...areas.styles,
  ];
  const body = [
    circleFolder(input.circle),
    areas.folder,
    folder('eBird Hotspots', input.hotspots.map((h) => hotspotPlacemark(h, hasAreas))),
    folder('Recent eBird Sightings', input.sightings.map((s) => sightingPlacemark(s, hasAreas))),
  ].join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    `<name>${escapeHtml(input.title)}</name>${styles.join('')}${body}` +
    '</Document></kml>\n'
  );
}
