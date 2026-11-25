import { EBIRD_SITE_URL, ebirdChecklistUrl, type EbirdHotspot, type EbirdObservation } from '@birdspotter/birding-core/ebird.ts';
import { escapeHtml } from './mapText.ts';

const EBIRD_SOURCE_TEXT_HTML = '<div class="tooltip-source">Data: eBird.org</div>';
const EBIRD_SOURCE_LINK_HTML = `<div class="tooltip-source">Data: <a href="${EBIRD_SITE_URL}" target="_blank" rel="noreferrer">eBird.org</a></div>`;

function hotspotSummaryHtml(h: EbirdHotspot): string {
  return `<div class="tooltip-tag tag-hotspot">Hotspot</div>
          <strong>${escapeHtml(h.locName)}</strong>
          <div>All-time species: <strong>${h.numSpeciesAllTime ?? '—'}</strong></div>
          ${h.latestObsDt ? `<div>Latest obs: ${escapeHtml(h.latestObsDt)}</div>` : ''}`;
}

export function hotspotHoverHtml(h: EbirdHotspot): string {
  return `<div class="map-tooltip">${hotspotSummaryHtml(h)}${EBIRD_SOURCE_TEXT_HTML}</div>`;
}

export function hotspotClickHtml(h: EbirdHotspot): string {
  return `<div class="map-tooltip">${hotspotSummaryHtml(h)}
          <div><a href="https://ebird.org/hotspot/${encodeURIComponent(h.locId)}" target="_blank" rel="noreferrer">Open in eBird &rarr;</a></div>
          ${EBIRD_SOURCE_LINK_HTML}
        </div>`;
}

export function sightingHtml(s: EbirdObservation): string {
  const countText = s.howMany !== undefined ? String(s.howMany) : 'X (present)';
  return `<div class="map-tooltip">
        <div class="tooltip-tag tag-sighting">Recent Sighting</div>
        <strong>${escapeHtml(s.comName)}</strong> <em>(${escapeHtml(s.sciName)})</em>
        <div>Count: <strong>${escapeHtml(countText)}</strong></div>
        <div>Location: ${escapeHtml(s.locName)}</div>
        <div>Date: ${escapeHtml(s.obsDt)}</div>
        <div><a href="${ebirdChecklistUrl(s.subId)}" target="_blank" rel="noreferrer">View Checklist &rarr;</a></div>
        ${EBIRD_SOURCE_LINK_HTML}
      </div>`;
}
