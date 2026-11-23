import * as maplibregl from 'maplibre-gl';
import { AREAS_FILL_LAYER, AREAS_SOURCE } from './mapLayers.ts';
import { describeHoveredArea } from './areaFeatures.ts';
import { areaDisplayName, escapeHtml } from './mapText.ts';

export interface AreaInteractionHandlers {
  readonly participantCountFor: (areaCodeUpper: string) => number;
  readonly isNotCounted: (areaCodeUpper: string) => boolean;
  readonly onHoverChange: (pillText: string | null) => void;
  readonly onSelect: (code: string, label: string | null) => void;
}

function isOverIconMarker(originalEvent: Event): boolean {
  const target = originalEvent.target;
  return target instanceof Element && target.closest('.map-icon-marker') !== null;
}

/** @returns a function that removes the hover popup */
export function attachAreaInteractions(
  map: maplibregl.Map,
  handlers: AreaInteractionHandlers
): () => void {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  let hoveredFeatureId: number | null = null;

  function clearHover() {
    map.getCanvas().style.cursor = '';
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: AREAS_SOURCE, id: hoveredFeatureId }, { hover: false });
      hoveredFeatureId = null;
    }
    popup.remove();
    handlers.onHoverChange(null);
  }

  map.on('mousemove', AREAS_FILL_LAYER, (e) => {
    // Hotspot and sighting icons show their own tooltip.
    if (isOverIconMarker(e.originalEvent)) {
      clearHover();
      return;
    }
    const feat = e.features?.find((f) => !f.properties?.isOuter);
    if (!feat || typeof feat.id !== 'number') {
      clearHover();
      return;
    }

    map.getCanvas().style.cursor = 'pointer';
    if (hoveredFeatureId !== null && hoveredFeatureId !== feat.id) {
      map.setFeatureState({ source: AREAS_SOURCE, id: hoveredFeatureId }, { hover: false });
    }
    hoveredFeatureId = feat.id;
    map.setFeatureState({ source: AREAS_SOURCE, id: feat.id }, { hover: true });

    const code = String(feat.properties?.code ?? '');
    const upper = code.toUpperCase();
    const description = describeHoveredArea(code, handlers.participantCountFor(upper), handlers.isNotCounted(upper));
    handlers.onHoverChange(description.pill);
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="map-tooltip">
              <strong>${escapeHtml(areaDisplayName(code))}</strong>
              <div>${escapeHtml(description.tooltipCount)}</div>
              <div style="color:#64748b;font-size:0.75rem;margin-top:2px;">Click to view details</div>
            </div>`
      )
      .addTo(map);
  });

  map.on('mouseleave', AREAS_FILL_LAYER, clearHover);

  map.on('click', AREAS_FILL_LAYER, (e) => {
    if (isOverIconMarker(e.originalEvent)) return;
    const feat = e.features?.find((f) => !f.properties?.isOuter);
    if (!feat) return;
    const code = String(feat.properties?.code ?? '');
    if (!code) return;
    handlers.onSelect(code, feat.properties?.label ? String(feat.properties.label) : null);
  });

  return () => popup.remove();
}
