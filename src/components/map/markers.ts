import * as maplibregl from 'maplibre-gl';
import type { EbirdHotspot, EbirdObservation } from '../../services/ebird.ts';
import { areaDisplayName } from './mapText.ts';
import { BINOCULARS_SVG, BIRD_SVG } from './mapIcons.ts';
import { hotspotClickHtml, hotspotHoverHtml, sightingHtml } from './popupHtml.ts';

function createIconMarkerElement(kind: 'hotspot' | 'sighting', title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `map-icon-marker ${kind === 'hotspot' ? 'marker-hotspot' : 'marker-sighting'}`;
  el.innerHTML = kind === 'hotspot' ? BINOCULARS_SVG : BIRD_SVG;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', title);
  return el;
}

function addIconMarker(
  map: maplibregl.Map,
  el: HTMLDivElement,
  position: { lng: number; lat: number },
  hoverHtml: string,
  clickHtml: string
): maplibregl.Marker {
  const hoverPopup = new maplibregl.Popup({
    offset: 16,
    closeButton: false,
    closeOnClick: false,
  }).setHTML(hoverHtml);
  const clickPopup = new maplibregl.Popup({ offset: 16 }).setHTML(clickHtml);

  el.addEventListener('mouseenter', () => {
    if (!clickPopup.isOpen()) hoverPopup.setLngLat([position.lng, position.lat]).addTo(map);
  });
  el.addEventListener('mouseleave', () => hoverPopup.remove());

  return new maplibregl.Marker({ element: el })
    .setLngLat([position.lng, position.lat])
    .setPopup(clickPopup)
    .addTo(map);
}

export function addHotspotMarker(map: maplibregl.Map, h: EbirdHotspot): maplibregl.Marker {
  const el = createIconMarkerElement('hotspot', `Hotspot: ${h.locName}`);
  return addIconMarker(map, el, h, hotspotHoverHtml(h), hotspotClickHtml(h));
}

export function addSightingMarker(map: maplibregl.Map, s: EbirdObservation): maplibregl.Marker {
  const el = createIconMarkerElement('sighting', `Sighting: ${s.comName}`);
  const html = sightingHtml(s);
  return addIconMarker(map, el, s, html, html);
}

export function addAreaLabelMarker(
  map: maplibregl.Map,
  code: string,
  center: [number, number],
  onClick: () => void
): maplibregl.Marker {
  const el = document.createElement('div');
  el.className = 'area-label-pill';
  el.textContent = areaDisplayName(code);
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return new maplibregl.Marker({ element: el }).setLngLat(center).addTo(map);
}
