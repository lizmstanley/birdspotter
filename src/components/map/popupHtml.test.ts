import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotspotClickHtml, hotspotHoverHtml, sightingHtml } from './popupHtml.ts';
import type { EbirdHotspot, EbirdObservation } from '@birdspotter/birding-core/ebird.ts';

const hotspot = {
  locId: 'L123',
  locName: 'Lake <Park>',
  lat: 1,
  lng: 2,
  numSpeciesAllTime: 210,
  latestObsDt: '2026-11-20 08:00',
} as EbirdHotspot;

const sighting = {
  comName: 'Snowy Owl',
  sciName: 'Bubo scandiacus',
  subId: 'S 9',
  locName: 'Pier & Dock',
  obsDt: '2026-11-21 07:30',
} as EbirdObservation;

test('hotspot names are escaped in both popups', () => {
  assert.match(hotspotHoverHtml(hotspot), /Lake &lt;Park&gt;/);
  assert.match(hotspotClickHtml(hotspot), /Lake &lt;Park&gt;/);
});

test('only the click popup links to eBird', () => {
  assert.doesNotMatch(hotspotHoverHtml(hotspot), /href=/);
  assert.match(hotspotClickHtml(hotspot), /ebird\.org\/hotspot\/L123/);
});

test('every popup credits eBird.org and the clickable ones link to it', () => {
  assert.match(hotspotHoverHtml(hotspot), /Data: eBird\.org/);
  assert.match(hotspotClickHtml(hotspot), /href="https:\/\/ebird\.org"[^>]*>eBird\.org</);
  assert.match(sightingHtml(sighting), /href="https:\/\/ebird\.org"[^>]*>eBird\.org</);
});

test('a hotspot without a latest observation omits that line', () => {
  const html = hotspotHoverHtml({ ...hotspot, latestObsDt: undefined });
  assert.doesNotMatch(html, /Latest obs/);
});

test('a sighting with no count reads as present and the checklist id is URL-encoded', () => {
  const html = sightingHtml(sighting);
  assert.match(html, /X \(present\)/);
  assert.match(html, /checklist\/S%209/);
  assert.match(html, /Pier &amp; Dock/);
});

test('a sighting with a count shows the number', () => {
  assert.match(sightingHtml({ ...sighting, howMany: 2 }), /Count: <strong>2<\/strong>/);
});
