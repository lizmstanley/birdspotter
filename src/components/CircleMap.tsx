/**
 * Standalone MapLibre GL + Turf.js 15-mile geodesic circle, KML/KMZ/GeoJSON boundary overlay
 * with hover highlighting & click-to-open area details, and BYOK eBird scouting map.
 * Zero dependency on CBC roster tables—can be lifted directly into Aviscout.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  buildCirclePolygon,
  fetchHotspotsInCircle,
  fetchRecentSightingsInCircle,
  type EbirdHotspot,
  type EbirdObservation,
} from '../services/ebird';
import {
  searchAudubonCircles,
  withAudubonPageDetails,
  type AudubonCircleResult,
} from '../services/audubonCircles';
import { findAreaAt } from '../services/areaLookup';
import {
  computeGeometryCenter,
  getPaletteColorForCode,
  isOuterCircleName,
  parseGeoJsonText,
  parseKmlText,
  parseKmzBuffer,
  type GeoJsonGeometry,
  type ParsedAreaBoundary,
} from '../services/kmlParser';

export interface AreaBoundaryItem {
  code: string;
  label?: string | null;
  boundary_geojson: GeoJsonGeometry;
}

export interface CircleMapProps {
  activeCode: string;
  activeName: string;
  centerLat: number;
  centerLng: number;
  radiusMiles?: number;
  areaBoundaries?: AreaBoundaryItem[];
  areaParticipantCounts?: Record<string, number>;
  notCountedAreaCodes?: string[];
  onCenterChange?: (lat: number, lng: number) => void;
  onSelectArea?: (areaCode: string, label?: string | null) => void;
  onImportBoundaries?: (boundaries: ParsedAreaBoundary[]) => Promise<{ saved: number }>;
  onClearBoundaries?: () => Promise<void>;
  onSaveScoutedCircle?: (circle: {
    code: string;
    name: string;
    state_province?: string | null;
    center_lat: number;
    center_lng: number;
    radius_miles?: number;
    compiler_name?: string | null;
    compiler_email?: string | null;
    count_date?: string | null;
    audubon_url?: string | null;
  }) => Promise<void>;
  /** The compiler's eBird API key, the same for every circle. Empty when none is saved. */
  ebirdApiKey: string;
}

type BasemapKind = 'street' | 'satellite';


const BINOCULARS_SVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="6.5" cy="15.5" r="3.5"/>
  <circle cx="17.5" cy="15.5" r="3.5"/>
  <path d="M10 15.5h4"/>
  <path d="M4.2 13L6 6.5A2 2 0 0 1 7.9 5H10v7"/>
  <path d="M19.8 13L18 6.5A2 2 0 0 0 16.1 5H14v7"/>
</svg>`;

const BIRD_SVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M16 7h.01"/>
  <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
  <path d="m20 7 2 .5-2 .5"/>
  <path d="M10 18v3"/>
  <path d="M14 17.75V21"/>
  <path d="M7 18a6 6 0 0 0 3.84-10.61"/>
</svg>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isOuterCircleBoundary(code: string, label?: string | null): boolean {
  return isOuterCircleName(`${code} ${label ?? ''}`);
}

const NEEDS_KEY_TITLE = 'Add your free eBird API key on the Help & API Keys tab to use this.';

/**
 * Browsers show no tooltip on a disabled control, so without a key the control sits in a span
 * that carries the tooltip instead.
 */
function NeedsEbirdKey({ hasKey, children }: { hasKey: boolean; children: ReactNode }) {
  if (hasKey) return <>{children}</>;
  return (
    <span className="needs-key" title={NEEDS_KEY_TITLE}>
      {children}
    </span>
  );
}

function areaLabel(code: string | null): string {
  if (!code) return '—';
  return /^\d/.test(code) ? `Area ${code}` : code;
}

function createIconMarkerElement(kind: 'hotspot' | 'sighting', title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `map-icon-marker ${kind === 'hotspot' ? 'marker-hotspot' : 'marker-sighting'}`;
  el.innerHTML = kind === 'hotspot' ? BINOCULARS_SVG : BIRD_SVG;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', title);
  return el;
}

function getBasemapStyle(kind: BasemapKind): StyleSpecification {
  const tiles =
    kind === 'satellite'
      ? ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
      : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];

  const attribution =
    kind === 'satellite'
      ? 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
      : '&copy; OpenStreetMap contributors';

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution,
      },
    },
    layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap' }],
  };
}

export function CircleMap({
  activeCode,
  activeName,
  centerLat,
  centerLng,
  radiusMiles = 7.5,
  areaBoundaries = [],
  areaParticipantCounts = {},
  notCountedAreaCodes = [],
  onCenterChange,
  onSelectArea,
  onImportBoundaries,
  onClearBoundaries,
  onSaveScoutedCircle,
  ebirdApiKey,
}: CircleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hotspotMarkersRef = useRef<maplibregl.Marker[]>([]);
  const sightingMarkersRef = useRef<maplibregl.Marker[]>([]);
  const areaLabelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const kmlInputRef = useRef<HTMLInputElement | null>(null);
  const hoveredFeatureIdRef = useRef<number | null>(null);
  const onSelectAreaRef = useRef(onSelectArea);
  onSelectAreaRef.current = onSelectArea;
  const areaCountsRef = useRef(areaParticipantCounts);
  areaCountsRef.current = areaParticipantCounts;
  const notCountedRef = useRef(new Set(notCountedAreaCodes.map((c) => c.toUpperCase())));
  notCountedRef.current = new Set(notCountedAreaCodes.map((c) => c.toUpperCase()));
  const areaHoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKind>('street');
  const [showCircleOverlay, setShowCircleOverlay] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showSightings, setShowSightings] = useState(true);
  const [hoveredArea, setHoveredArea] = useState<string | null>(null);

  // Ephemeral "Scout Any Circle / Location" state (does not modify My Circles)
  const [scoutTarget, setScoutTarget] = useState<{
    code: string;
    name: string;
    state?: string;
    lat: number;
    lng: number;
    compilerName?: string;
    compilerEmail?: string;
    countDate?: string;
    audubonUrl?: string;
  } | null>(null);
  const [scoutQuery, setScoutQuery] = useState('');
  const [scoutSearching, setScoutSearching] = useState(false);
  const [scoutResults, setScoutResults] = useState<AudubonCircleResult[]>([]);
  const [scoutError, setScoutError] = useState<string | null>(null);

  const isScouting = scoutTarget !== null;
  const effectiveCode = scoutTarget?.code ?? activeCode;
  const effectiveName = scoutTarget?.name ?? activeName;
  const effectiveLat = scoutTarget?.lat ?? centerLat;
  const effectiveLng = scoutTarget?.lng ?? centerLng;

  const isScoutingRef = useRef(isScouting);
  isScoutingRef.current = isScouting;

  const [backDays, setBackDays] = useState(7);
  const [hotspots, setHotspots] = useState<EbirdHotspot[]>([]);
  const [sightings, setSightings] = useState<EbirdObservation[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Your areas aren't on the map while scouting somewhere else, so no area applies then.
  // An area marked Not Counted (a neighboring count's outline, for example) never claims a spot.
  const areaOutlines = useMemo(() => {
    if (isScouting) return [];
    const notCounted = new Set(notCountedAreaCodes.map((c) => c.toUpperCase()));
    return areaBoundaries.filter((b) => !notCounted.has(b.code.toUpperCase()));
  }, [isScouting, areaBoundaries, notCountedAreaCodes]);
  const hasAreas = areaOutlines.length > 0;
  const hotspotRows = useMemo(
    () => hotspots.map((h) => ({ ...h, area: findAreaAt(areaOutlines, h.lng, h.lat) })),
    [hotspots, areaOutlines]
  );
  const sightingRows = useMemo(
    () => sightings.map((s) => ({ ...s, area: findAreaAt(areaOutlines, s.lng, s.lat) })),
    [sightings, areaOutlines]
  );

  useEffect(() => {
    setScoutTarget(null);
    setScoutResults([]);
    setScoutError(null);
    setHotspots([]);
    setSightings([]);
    setStatus(null);
  }, [activeCode]);

  // 1. Initialize MapLibre instance (re-runs only when basemap changes)
  useEffect(() => {
    if (!containerRef.current) return;
    setMapReady(false);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(basemap),
      center: [centerLng, centerLat],
      zoom: 10.5,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const centerMarker = new maplibregl.Marker({ draggable: true, color: '#dc2626' })
      .setLngLat([centerLng, centerLat])
      .addTo(map);
    markerRef.current = centerMarker;

    centerMarker.on('dragend', () => {
      const { lng, lat } = centerMarker.getLngLat();
      const roundedLat = Number(lat.toFixed(5));
      const roundedLng = Number(lng.toFixed(5));
      if (isScoutingRef.current) {
        setScoutTarget((prev) => (prev ? { ...prev, lat: roundedLat, lng: roundedLng } : prev));
      } else {
        onCenterChange?.(roundedLat, roundedLng);
      }
    });

    map.on('error', (ev) => {
      const msg = ev.error?.message || (typeof ev.error === 'string' ? ev.error : '');
      if (msg) setStatus(`Map notice: ${msg}`);
    });

    map.on('load', () => {
      // Add empty sources & layers upfront so data updates never race with tile loading
      map.addSource('cbc-circle', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'cbc-circle-fill',
        type: 'fill',
        source: 'cbc-circle',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'cbc-circle-outline',
        type: 'line',
        source: 'cbc-circle',
        paint: { 'line-color': '#1d4ed8', 'line-width': 3 },
      });

      map.addSource('cbc-areas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'cbc-areas-fill',
        type: 'fill',
        source: 'cbc-areas',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            ['get', 'hoverOpacity'],
            ['get', 'fillOpacity'],
          ],
        },
      });
      map.addLayer({
        id: 'cbc-areas-outline-halo',
        type: 'line',
        source: 'cbc-areas',
        paint: {
          'line-color': '#ffffff',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            6.5,
            4.5,
          ],
          'line-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'cbc-areas-outline',
        type: 'line',
        source: 'cbc-areas',
        paint: {
          'line-color': ['get', 'strokeColor'],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            4.5,
            ['get', 'lineWidth'],
          ],
        },
      });

      const areaHoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
      areaHoverPopupRef.current = areaHoverPopup;

      function clearAreaHover() {
        map.getCanvas().style.cursor = '';
        if (hoveredFeatureIdRef.current !== null) {
          map.setFeatureState({ source: 'cbc-areas', id: hoveredFeatureIdRef.current }, { hover: false });
          hoveredFeatureIdRef.current = null;
        }
        areaHoverPopup.remove();
        setHoveredArea(null);
      }

      // Hover highlight interaction + participant count tooltip
      map.on('mousemove', 'cbc-areas-fill', (e) => {
        // Mouse events on hotspot and sighting icons also reach the map; their own tooltip wins.
        const target = e.originalEvent.target;
        if (target instanceof Element && target.closest('.map-icon-marker')) {
          clearAreaHover();
          return;
        }
        const feat = e.features?.find((f) => !f.properties?.isOuter);
        if (!feat || typeof feat.id !== 'number') {
          clearAreaHover();
          return;
        }

        map.getCanvas().style.cursor = 'pointer';
        if (hoveredFeatureIdRef.current !== null && hoveredFeatureIdRef.current !== feat.id) {
          map.setFeatureState({ source: 'cbc-areas', id: hoveredFeatureIdRef.current }, { hover: false });
        }
        hoveredFeatureIdRef.current = feat.id;
        map.setFeatureState({ source: 'cbc-areas', id: feat.id }, { hover: true });

        const code = String(feat.properties?.code ?? '');
        const displayName = /^\d/.test(code) ? `Area ${code}` : code;
        const isExcluded = notCountedRef.current.has(code.toUpperCase());
        const count = areaCountsRef.current[code.toUpperCase()] ?? 0;
        const countLabel = isExcluded
          ? 'Not counted in this circle'
          : count === 1
            ? '1 participant assigned'
            : `${count} participants assigned`;

        setHoveredArea(isExcluded ? `${displayName} · Not Counted` : `${displayName} · ${count} assigned`);
        areaHoverPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-tooltip">
              <strong>${escapeHtml(displayName)}</strong>
              <div>${escapeHtml(countLabel)}</div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:2px;">Click to view details</div>
            </div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', 'cbc-areas-fill', clearAreaHover);

      // Click area -> navigate to Area Detail Page
      map.on('click', 'cbc-areas-fill', (e) => {
        const target = e.originalEvent.target;
        if (target instanceof Element && target.closest('.map-icon-marker')) return;
        const feat = e.features?.find((f) => !f.properties?.isOuter);
        if (!feat) return;
        const code = String(feat.properties?.code ?? '');
        const label = feat.properties?.label ? String(feat.properties.label) : null;
        if (code) {
          onSelectAreaRef.current?.(code, label);
        }
      });

      setMapReady(true);
    });

    return () => {
      hotspotMarkersRef.current.forEach((m) => m.remove());
      hotspotMarkersRef.current = [];
      sightingMarkersRef.current.forEach((m) => m.remove());
      sightingMarkersRef.current = [];
      areaLabelMarkersRef.current.forEach((m) => m.remove());
      areaLabelMarkersRef.current = [];
      areaHoverPopupRef.current?.remove();
      centerMarker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  // 2. Sync 15-mile circle & center pin whenever coordinates or visibility change
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !mapReady) return;

    const showCircle = isScouting || showCircleOverlay;
    const circlePolygon = buildCirclePolygon(effectiveLng, effectiveLat, radiusMiles);
    marker.setLngLat([effectiveLng, effectiveLat]);
    marker.getElement().style.display = showCircle ? '' : 'none';

    const src = map.getSource('cbc-circle') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      const data = showCircle ? circlePolygon : { type: 'FeatureCollection' as const, features: [] };
      src.setData(data as never);
    }
  }, [mapReady, effectiveLat, effectiveLng, radiusMiles, showCircleOverlay, isScouting]);

  // Zoom so the whole circle fits the map, only when the circle itself moves or changes size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ring = buildCirclePolygon(effectiveLng, effectiveLat, radiusMiles).geometry.coordinates[0];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 24, essential: true }
    );
  }, [mapReady, effectiveLat, effectiveLng, radiusMiles]);

  // 3. Sync imported KML/KMZ/GeoJSON area polygons & clickable labels (hidden while scouting elsewhere)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleBoundaries = isScouting || !showAreas ? [] : areaBoundaries;
    const src = map.getSource('cbc-areas') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      const notCountedSet = new Set(notCountedAreaCodes.map((c) => c.toUpperCase()));
      const features = visibleBoundaries.map((item, idx) => {
        const isOuter = isOuterCircleBoundary(item.code, item.label);
        const isExcluded = notCountedSet.has(item.code.toUpperCase());
        const palette = getPaletteColorForCode(item.code, idx);
        return {
          type: 'Feature' as const,
          id: idx + 1,
          properties: {
            code: item.code,
            label: item.label ?? '',
            isOuter,
            fillColor: isOuter ? '#000000' : isExcluded ? '#64748b' : palette.fill,
            strokeColor: isOuter ? '#1e293b' : isExcluded ? '#475569' : palette.stroke,
            fillOpacity: isOuter ? 0 : isExcluded ? 0.32 : 0.28,
            hoverOpacity: isOuter ? 0 : isExcluded ? 0.45 : 0.52,
            lineWidth: isOuter ? 3.5 : 2.5,
          },
          geometry: item.boundary_geojson,
        };
      });
      src.setData({ type: 'FeatureCollection', features } as never);
    }

    areaLabelMarkersRef.current.forEach((m) => m.remove());
    areaLabelMarkersRef.current = [];
    for (const item of visibleBoundaries) {
      if (isOuterCircleBoundary(item.code, item.label)) continue;
      const center = computeGeometryCenter(item.boundary_geojson);
      if (!center) continue;
      const el = document.createElement('div');
      el.className = 'area-label-pill';
      el.textContent = /^\d/.test(item.code) ? `Area ${item.code}` : item.code;

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectAreaRef.current?.(item.code, item.label ?? null);
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat(center).addTo(map);
      areaLabelMarkersRef.current.push(marker);
    }
  }, [mapReady, areaBoundaries, areaParticipantCounts, notCountedAreaCodes, isScouting, showAreas]);

  // 4. Render Hotspot (Binoculars) markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    hotspotMarkersRef.current.forEach((m) => m.remove());
    hotspotMarkersRef.current = (showHotspots ? hotspots : []).map((h) => {
      const el = createIconMarkerElement('hotspot', `Hotspot: ${h.locName}`);
      const hoverPopup = new maplibregl.Popup({
        offset: 16,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(
        `<div class="map-tooltip">
          <div class="tooltip-tag tag-hotspot">Hotspot</div>
          <strong>${escapeHtml(h.locName)}</strong>
          <div>All-time species: <strong>${h.numSpeciesAllTime ?? '—'}</strong></div>
          ${h.latestObsDt ? `<div>Latest obs: ${escapeHtml(h.latestObsDt)}</div>` : ''}
        </div>`
      );

      const clickPopup = new maplibregl.Popup({ offset: 16 }).setHTML(
        `<div class="map-tooltip">
          <div class="tooltip-tag tag-hotspot">Hotspot</div>
          <strong>${escapeHtml(h.locName)}</strong>
          <div>All-time species: <strong>${h.numSpeciesAllTime ?? '—'}</strong></div>
          ${h.latestObsDt ? `<div>Latest obs: ${escapeHtml(h.latestObsDt)}</div>` : ''}
          <div><a href="https://ebird.org/hotspot/${encodeURIComponent(h.locId)}" target="_blank" rel="noreferrer">Open in eBird &rarr;</a></div>
        </div>`
      );

      el.addEventListener('mouseenter', () => {
        if (!clickPopup.isOpen()) hoverPopup.setLngLat([h.lng, h.lat]).addTo(map);
      });
      el.addEventListener('mouseleave', () => hoverPopup.remove());

      return new maplibregl.Marker({ element: el })
        .setLngLat([h.lng, h.lat])
        .setPopup(clickPopup)
        .addTo(map);
    });
  }, [mapReady, hotspots, showHotspots]);

  // 5. Render Recent Sighting (Bird) markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    sightingMarkersRef.current.forEach((m) => m.remove());
    sightingMarkersRef.current = (showSightings ? sightings : []).map((s) => {
      const el = createIconMarkerElement('sighting', `Sighting: ${s.comName}`);
      const countText = s.howMany !== undefined ? String(s.howMany) : 'X (present)';
      const html = `<div class="map-tooltip">
        <div class="tooltip-tag tag-sighting">Recent Sighting</div>
        <strong>${escapeHtml(s.comName)}</strong> <em>(${escapeHtml(s.sciName)})</em>
        <div>Count: <strong>${escapeHtml(countText)}</strong></div>
        <div>Location: ${escapeHtml(s.locName)}</div>
        <div>Date: ${escapeHtml(s.obsDt)}</div>
        <div><a href="https://ebird.org/checklist/${encodeURIComponent(s.subId)}" target="_blank" rel="noreferrer">View Checklist &rarr;</a></div>
      </div>`;

      const hoverPopup = new maplibregl.Popup({
        offset: 16,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(html);

      const clickPopup = new maplibregl.Popup({ offset: 16 }).setHTML(html);

      el.addEventListener('mouseenter', () => {
        if (!clickPopup.isOpen()) hoverPopup.setLngLat([s.lng, s.lat]).addTo(map);
      });
      el.addEventListener('mouseleave', () => hoverPopup.remove());

      return new maplibregl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(clickPopup)
        .addTo(map);
    });
  }, [mapReady, sightings, showSightings]);

  async function handleKmlFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    try {
      const lower = file.name.toLowerCase();
      let parsed: ParsedAreaBoundary[];
      if (lower.endsWith('.kmz')) {
        parsed = parseKmzBuffer(await file.arrayBuffer());
      } else if (lower.endsWith('.kml')) {
        parsed = parseKmlText(await file.text());
      } else {
        parsed = parseGeoJsonText(await file.text());
      }

      if (parsed.length === 0) {
        setStatus('No polygons or lines found in that file.');
        return;
      }

      if (onImportBoundaries) {
        const res = await onImportBoundaries(parsed);
        setStatus(
          `Imported ${res.saved} area boundaries for ${activeCode} from ${file.name}. Hover any area to highlight it, or click to view its assigned counters.`
        );
      }
    } catch (err) {
      setStatus(`KML/KMZ import error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (kmlInputRef.current) kmlInputRef.current.value = '';
    }
  }

  async function handleFetchEbird() {
    if (!ebirdApiKey) {
      setStatus('Add your free eBird API key on the Help & API Keys tab first.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const [hs, obs] = await Promise.all([
        fetchHotspotsInCircle(ebirdApiKey, effectiveLat, effectiveLng, radiusMiles),
        fetchRecentSightingsInCircle(ebirdApiKey, effectiveLat, effectiveLng, radiusMiles, backDays),
      ]);
      setHotspots(hs);
      setSightings(obs);
      setStatus(
        `Found ${hs.length} hotspots and ${obs.length} recent species inside ${effectiveCode}. Hover any icon for details or click to open in eBird.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleScoutSearch() {
    if (scoutQuery.trim().length < 2) {
      setScoutError('Enter a circle name, code, or town (e.g. Isabella, MN or Duluth, MN).');
      return;
    }
    setScoutSearching(true);
    setScoutError(null);
    try {
      const res = await searchAudubonCircles(scoutQuery);
      setScoutResults(res);
      if (res.length === 0) {
        setScoutError('No matching circles or places found. Try adding a state (e.g. "Isabella, MN").');
      }
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : String(err));
    } finally {
      setScoutSearching(false);
    }
  }

  async function handlePreviewScoutResult(result: AudubonCircleResult) {
    setScoutSearching(true);
    try {
      const r = await withAudubonPageDetails(result);
      setScoutTarget({
        code: r.code,
        name: r.name,
        state: r.state,
        lat: r.lat,
        lng: r.lng,
        compilerName: r.compilerName,
        compilerEmail: r.compilerEmail,
        countDate: r.countDate,
        audubonUrl: r.source === 'audubon' ? r.joinUrl : undefined,
      });
      setScoutResults([]);
      setScoutQuery('');
      setHotspots([]);
      setSightings([]);
      setStatus(`Scouting ${r.code} — ${r.name}. Drag the red pin to test new circle placements, then click "Load Hotspots & Sightings".`);
    } finally {
      setScoutSearching(false);
    }
  }

  function handleScoutMyLocation() {
    if (!navigator.geolocation) {
      setScoutError('Geolocation is not supported by your browser.');
      return;
    }
    setScoutError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setScoutTarget({
          code: 'SCOUT',
          name: 'My Current Location',
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setScoutResults([]);
        setHotspots([]);
        setSightings([]);
        setStatus('Scouting 15-mile circle at your current location. Drag the red pin or click "Load Hotspots & Sightings".');
      },
      (err) => {
        setScoutError(`Location error: ${err.message}`);
      }
    );
  }

  function handleExitScout() {
    setScoutTarget(null);
    setScoutResults([]);
    setScoutError(null);
    setHotspots([]);
    setSightings([]);
    setStatus(null);
  }

  return (
    <div className="stack">
      <div className="card scout-bar-card">
        <div className="card-header" style={{ marginBottom: 4 }}>
          <div>
            <h2>Scout Any Circle or Potential New Location</h2>
            <p className="muted">
              Preview a 15-mile circle and check eBird hotspots &amp; sightings anywhere—without adding it to &ldquo;My Circles&rdquo;.
            </p>
          </div>
          {isScouting && (
            <div className="row-actions">
              {onSaveScoutedCircle && scoutTarget && (
                <button
                  type="button"
                  className="btn-primary"
                  title="Add this circle, at the pin's current spot, to My Circles"
                  onClick={() => {
                    void onSaveScoutedCircle({
                      code: scoutTarget.code,
                      name: scoutTarget.name,
                      state_province: scoutTarget.state ?? null,
                      center_lat: scoutTarget.lat,
                      center_lng: scoutTarget.lng,
                      radius_miles: radiusMiles,
                      compiler_name: scoutTarget.compilerName ?? null,
                      compiler_email: scoutTarget.compilerEmail ?? null,
                      count_date: scoutTarget.countDate ?? null,
                      audubon_url: scoutTarget.audubonUrl ?? null,
                    }).then(() => setScoutTarget(null));
                  }}
                >
                  Save to My Circles
                </button>
              )}
              <button type="button" onClick={handleExitScout}>
                &larr; Back to {activeCode}
              </button>
            </div>
          )}
        </div>

        <div className="ebird-bar" style={{ marginBottom: 4 }}>
          <input
            type="text"
            placeholder="Scout any CBC circle or town (e.g. Isabella, MN or Duluth, MN or St. Paul)..."
            value={scoutQuery}
            onChange={(e) => setScoutQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleScoutSearch();
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={scoutSearching}
            title="Look at any circle or town on the map without adding it to My Circles. Loading its hotspots and sightings needs an eBird key."
            onClick={() => void handleScoutSearch()}
          >
            {scoutSearching ? 'Searching...' : 'Scout Location'}
          </button>
          <button
            type="button"
            title="Center a scouting circle on where you are now. Your browser asks for permission first."
            onClick={handleScoutMyLocation}
          >
            Use My Location
          </button>
        </div>

        {scoutError && <p className="status-banner">{scoutError}</p>}

        {scoutResults.length > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Location</th>
                <th>Source</th>
                <th>Center</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scoutResults.map((r, idx) => (
                <tr key={`${r.code}-${idx}`}>
                  <td><strong>{r.code}</strong></td>
                  <td>{r.name}</td>
                  <td>{r.source === 'audubon' ? 'Audubon CBC' : 'OSM Place'}</td>
                  <td><code>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</code></td>
                  <td>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={scoutSearching}
                      onClick={() => void handlePreviewScoutResult(r)}
                    >
                      Preview on Map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>
              {isScouting && <span className="badge" style={{ marginLeft: 0, marginRight: 8 }}>Scout Mode</span>}
              {effectiveCode} — {effectiveName}
            </h2>
            <p className="muted">
              Center: <code>{effectiveLat.toFixed(4)}, {effectiveLng.toFixed(4)}</code> ({radiusMiles * 2}-mile diameter)
              {!isScouting && (
                <span
                  className={`hover-pill${hoveredArea ? ' is-visible' : ''}`}
                  aria-hidden={!hoveredArea}
                  title={hoveredArea ?? undefined}
                >
                  Hovering: <strong>{hoveredArea ?? ''}</strong> (click to open)
                </span>
              )}
            </p>
          </div>
          <div className="controls">
            <div className="segmented">
              <button
                className={basemap === 'street' ? 'active' : ''}
                onClick={() => setBasemap('street')}
              >
                Street (OSM)
              </button>
              <button
                className={basemap === 'satellite' ? 'active' : ''}
                onClick={() => setBasemap('satellite')}
              >
                Satellite (Esri)
              </button>
            </div>
          </div>
        </div>

        <div className="ebird-bar">
          <NeedsEbirdKey hasKey={Boolean(ebirdApiKey)}>
          <select
            value={backDays}
            disabled={!ebirdApiKey}
            title="How far back to look for recent sightings"
            onChange={(e) => setBackDays(Number(e.target.value))}
          >
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          </NeedsEbirdKey>
          <NeedsEbirdKey hasKey={Boolean(ebirdApiKey)}>
            <button
              className="btn-primary"
              disabled={busy || !ebirdApiKey}
              title="Ask eBird for hotspots and recent sightings inside the circle"
              onClick={() => void handleFetchEbird()}
            >
              {busy ? 'Fetching eBird...' : 'Load Hotspots & Sightings'}
            </button>
          </NeedsEbirdKey>
        </div>

        {!isScouting && (
        <div className="kml-bar">
          <input
            ref={kmlInputRef}
            type="file"
            accept=".kml,.kmz,.geojson,.json"
            style={{ display: 'none' }}
            onChange={(e) => void handleKmlFileChange(e)}
          />
          <button
            type="button"
            title="Add area outlines from a KML, KMZ, or GeoJSON file, for example one exported from Google My Maps. The app can't draw areas itself."
            onClick={() => kmlInputRef.current?.click()}
          >
            Import KML / KMZ / GeoJSON Areas
          </button>
          {areaBoundaries.length > 0 && onClearBoundaries && (
            <button
              type="button"
              title="Remove all imported area outlines from the map. Your areas and people stay."
              onClick={() => void onClearBoundaries()}
            >
              Clear Areas ({areaBoundaries.length})
            </button>
          )}
          <span className="muted">
            Hover any area to highlight; click an area to view its assigned counters.
          </span>
        </div>
        )}

        <div className="map-legend" role="group" aria-label="Show or hide map layers">
          {!isScouting && (
            <button
              type="button"
              className={`legend-item legend-toggle${showCircleOverlay ? '' : ' is-off'}`}
              aria-pressed={showCircleOverlay}
              title="Show or hide the 15-mile circle and its center pin. Drag the pin to move the circle's center."
              onClick={() => setShowCircleOverlay((v) => !v)}
            >
              <span className="legend-dot dot-center" /> Circle &amp; Center (draggable)
            </button>
          )}
          {!isScouting && (
            <button
              type="button"
              className={`legend-item legend-toggle${showAreas ? '' : ' is-off'}`}
              aria-pressed={showAreas}
              title="Show or hide your imported area outlines"
              onClick={() => setShowAreas((v) => !v)}
            >
              <span className="legend-dot dot-area" /> Imported Areas ({areaBoundaries.length})
            </button>
          )}
          <button
            type="button"
            className={`legend-item legend-toggle${showHotspots ? '' : ' is-off'}`}
            aria-pressed={showHotspots}
            title="Show or hide eBird hotspots"
            onClick={() => setShowHotspots((v) => !v)}
          >
            <span className="legend-icon marker-hotspot" dangerouslySetInnerHTML={{ __html: BINOCULARS_SVG }} />
            eBird Hotspot ({hotspots.length})
          </button>
          <button
            type="button"
            className={`legend-item legend-toggle${showSightings ? '' : ' is-off'}`}
            aria-pressed={showSightings}
            title="Show or hide recent eBird sightings"
            onClick={() => setShowSightings((v) => !v)}
          >
            <span className="legend-icon marker-sighting" dangerouslySetInnerHTML={{ __html: BIRD_SVG }} />
            Recent Sighting ({sightings.length})
          </button>
        </div>

        {status && <p className="status-banner">{status}</p>}

        <div ref={containerRef} className="map-container" />
      </div>

      {sightingRows.length > 0 && (
        <details className="card collapsible-card">
          <summary>
            <h2>Recent eBird Sightings Inside {effectiveCode} ({sightingRows.length} species)</h2>
          </summary>
          <table>
            <thead>
              <tr>
                <th>Species</th>
                <th>Count</th>
                {hasAreas && <th>Area</th>}
                <th>Location</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {sightingRows.map((s) => (
                <tr key={`${s.subId}-${s.speciesCode}`}>
                  <td><strong>{s.comName}</strong></td>
                  <td>{s.howMany ?? 'X'}</td>
                  {hasAreas && <td>{areaLabel(s.area)}</td>}
                  <td>{s.locName}</td>
                  <td>{s.obsDt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {hotspotRows.length > 0 && (
        <details className="card collapsible-card">
          <summary>
            <h2>eBird Hotspots Inside {effectiveCode} ({hotspotRows.length})</h2>
          </summary>
          <table>
            <thead>
              <tr>
                <th>Hotspot</th>
                {hasAreas && <th>Area</th>}
                <th>All-Time Species</th>
                <th>Latest Checklist</th>
              </tr>
            </thead>
            <tbody>
              {hotspotRows.map((h) => (
                <tr key={h.locId}>
                  <td>
                    <a href={`https://ebird.org/hotspot/${encodeURIComponent(h.locId)}`} target="_blank" rel="noreferrer">
                      {h.locName}
                    </a>
                  </td>
                  {hasAreas && <td>{areaLabel(h.area)}</td>}
                  <td>{h.numSpeciesAllTime ?? '—'}</td>
                  <td>{h.latestObsDt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
