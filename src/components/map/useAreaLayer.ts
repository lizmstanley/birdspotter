import { useEffect, useRef, useState, type RefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { computeGeometryCenter } from '../../services/kmlParser.ts';
import { attachAreaInteractions } from './areaInteractions.ts';
import { buildAreaFeatures, toUpperCaseSet } from './areaFeatures.ts';
import { AREAS_SOURCE } from './mapLayers.ts';
import { addAreaLabelMarker } from './markers.ts';
import { isOuterCircleBoundary } from './mapText.ts';
import { useLatest } from './useLatest.ts';
import type { AreaBoundaryItem } from './types.ts';

interface AreaLayerOptions {
  readonly mapRef: RefObject<maplibregl.Map | null>;
  readonly mapReady: boolean;
  readonly areaBoundaries: AreaBoundaryItem[];
  readonly areaParticipantCounts: Record<string, number>;
  readonly notCountedAreaCodes: string[];
  readonly isHidden: boolean;
  readonly onSelectArea?: (areaCode: string, label?: string | null) => void;
}

/** @returns the hover summary shown above the map, or null when no area is hovered */
export function useAreaLayer({
  mapRef,
  mapReady,
  areaBoundaries,
  areaParticipantCounts,
  notCountedAreaCodes,
  isHidden,
  onSelectArea,
}: AreaLayerOptions): string | null {
  const [hoveredArea, setHoveredArea] = useState<string | null>(null);
  const labelMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectAreaRef = useLatest(onSelectArea);
  const countsRef = useLatest(areaParticipantCounts);
  const notCountedRef = useLatest(toUpperCaseSet(notCountedAreaCodes));

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    return attachAreaInteractions(map, {
      participantCountFor: (codeUpper) => countsRef.current[codeUpper] ?? 0,
      isNotCounted: (codeUpper) => notCountedRef.current.has(codeUpper),
      onHoverChange: setHoveredArea,
      onSelect: (code, label) => onSelectAreaRef.current?.(code, label),
    });
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visible = isHidden ? [] : areaBoundaries;
    const src = map.getSource(AREAS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: buildAreaFeatures(visible, notCountedAreaCodes) } as never);

    labelMarkersRef.current = visible.flatMap((item) => {
      if (isOuterCircleBoundary(item.code, item.label)) return [];
      const center = computeGeometryCenter(item.boundary_geojson);
      if (!center) return [];
      return [
        addAreaLabelMarker(map, item.code, center, () =>
          onSelectAreaRef.current?.(item.code, item.label ?? null)
        ),
      ];
    });
    return () => {
      labelMarkersRef.current.forEach((m) => m.remove());
      labelMarkersRef.current = [];
    };
  }, [mapReady, areaBoundaries, areaParticipantCounts, notCountedAreaCodes, isHidden]);

  return hoveredArea;
}
