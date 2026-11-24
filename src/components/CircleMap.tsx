import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { findAreaAt } from '../services/areaLookup';
import { CBC_CIRCLE_RADIUS_MILES } from '../services/cbcCircle';
import type { ParsedAreaBoundary } from '../services/kmlParser';
import { AreaImportBar } from './map/AreaImportBar';
import { excludeNotCounted } from './map/areaFeatures';
import { EbirdControls } from './map/EbirdControls';
import { HotspotsTable, SightingsTable } from './map/EbirdTables';
import { LayerLegend } from './map/LayerLegend';
import { ScoutPanel } from './map/ScoutPanel';
import type { AreaBoundaryItem, ScoutedCircleDraft } from './map/types';
import { useAreaLayer } from './map/useAreaLayer';
import { useCircleLayer } from './map/useCircleLayer';
import { useEbirdData } from './map/useEbirdData';
import { useEbirdMarkers } from './map/useEbirdMarkers';
import { useMapInstance } from './map/useMapInstance';
import { useScouting } from './map/useScouting';

export type { AreaBoundaryItem };

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
  onSaveScoutedCircle?: (circle: ScoutedCircleDraft) => Promise<boolean>;
  /** The compiler's eBird API key, the same for every circle. Empty when none is saved. */
  ebirdApiKey: string;
}

export function CircleMap({
  activeCode,
  activeName,
  centerLat,
  centerLng,
  radiusMiles = CBC_CIRCLE_RADIUS_MILES,
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
  const [showCircleOverlay, setShowCircleOverlay] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showSightings, setShowSightings] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const ebird = useEbirdData({ ebirdApiKey, radiusMiles, setStatus });
  const scouting = useScouting({ setStatus, clearEbirdResults: ebird.clear });

  const isScouting = scouting.target !== null;
  const effectiveCode = scouting.target?.code ?? activeCode;
  const effectiveName = scouting.target?.name ?? activeName;
  const effectiveLat = scouting.target?.lat ?? centerLat;
  const effectiveLng = scouting.target?.lng ?? centerLng;

  // Your areas are not on the map while scouting elsewhere, so no area applies then.
  // An area marked Not Counted never claims a spot.
  const areaOutlines = useMemo(
    () => (isScouting ? [] : excludeNotCounted(areaBoundaries, notCountedAreaCodes)),
    [isScouting, areaBoundaries, notCountedAreaCodes]
  );
  const hasAreas = areaOutlines.length > 0;
  const hotspotRows = useMemo(
    () => ebird.hotspots.map((h) => ({ ...h, area: findAreaAt(areaOutlines, h.lng, h.lat) })),
    [ebird.hotspots, areaOutlines]
  );
  const sightingRows = useMemo(
    () => ebird.sightings.map((s) => ({ ...s, area: findAreaAt(areaOutlines, s.lng, s.lat) })),
    [ebird.sightings, areaOutlines]
  );

  const exitScouting = useEffectEvent(() => scouting.exit());
  useEffect(() => {
    exitScouting();
  }, [activeCode]);

  const { containerRef, mapRef, markerRef, mapReady } = useMapInstance({
    centerLat,
    centerLng,
    onPinDragged: (lat, lng) => (isScouting ? scouting.movePin(lat, lng) : onCenterChange?.(lat, lng)),
    onMapNotice: setStatus,
  });

  useCircleLayer({
    mapRef,
    markerRef,
    mapReady,
    lat: effectiveLat,
    lng: effectiveLng,
    radiusMiles,
    isCircleShown: isScouting || showCircleOverlay,
  });

  const hoveredArea = useAreaLayer({
    mapRef,
    mapReady,
    areaBoundaries,
    areaParticipantCounts,
    notCountedAreaCodes,
    isHidden: isScouting || !showAreas,
    onSelectArea,
  });

  useEbirdMarkers({
    mapRef,
    mapReady,
    hotspots: ebird.hotspots,
    sightings: ebird.sightings,
    showHotspots,
    showSightings,
  });

  return (
    <div className="stack">
      <ScoutPanel
        scouting={scouting}
        activeCode={activeCode}
        radiusMiles={radiusMiles}
        onSaveScoutedCircle={onSaveScoutedCircle}
      />

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
        </div>

        <EbirdControls
          hasKey={Boolean(ebirdApiKey)}
          backDays={ebird.backDays}
          isBusy={ebird.isBusy}
          onBackDaysChange={ebird.setBackDays}
          onLoad={() => void ebird.load(effectiveCode, effectiveLat, effectiveLng)}
        />

        {!isScouting && (
          <AreaImportBar
            activeCode={activeCode}
            areaCount={areaBoundaries.length}
            setStatus={setStatus}
            onImportBoundaries={onImportBoundaries}
            onClearBoundaries={onClearBoundaries}
          />
        )}

        <LayerLegend
          isScouting={isScouting}
          areaCount={areaBoundaries.length}
          hotspotCount={ebird.hotspots.length}
          sightingCount={ebird.sightings.length}
          circle={{ isShown: showCircleOverlay, toggle: () => setShowCircleOverlay((v) => !v) }}
          areas={{ isShown: showAreas, toggle: () => setShowAreas((v) => !v) }}
          hotspots={{ isShown: showHotspots, toggle: () => setShowHotspots((v) => !v) }}
          sightings={{ isShown: showSightings, toggle: () => setShowSightings((v) => !v) }}
        />

        {status && <p className="status-banner">{status}</p>}

        <div ref={containerRef} className="map-container" />
      </div>

      {sightingRows.length > 0 && (
        <SightingsTable circleCode={effectiveCode} rows={sightingRows} hasAreas={hasAreas} />
      )}
      {hotspotRows.length > 0 && (
        <HotspotsTable circleCode={effectiveCode} rows={hotspotRows} hasAreas={hasAreas} />
      )}
    </div>
  );
}
