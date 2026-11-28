import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { MapPlaceProperties } from './mapPlaces.ts';

const PLACE_SOURCE = 'birding-places';
const GROUP_LAYER = `${PLACE_SOURCE}-group`;
const PLACE_LAYER = `${PLACE_SOURCE}-place`;
// Below the map's top zoom, so places a few meters apart still split.
const GROUP_MAX_ZOOM = 14;
const GROUP_RADIUS_PX = 40;
// A fingertip covers more than a marker, so a tap counts this far around the touch point.
const TAP_SLOP_PX = 12;

const NOTABLE_COLOR = '#d97706';
const NOTABLE_RING_COLOR = '#78350f';
const HOTSPOT_COLOR = '#15803d';
const SIGHTING_COLOR = '#2563eb';
const GROUP_COLOR = '#475569';
const RING_COLOR = '#ffffff';

const NO_PLACES: FeatureCollection<Point, MapPlaceProperties> = { type: 'FeatureCollection', features: [] };
const IS_NOTABLE: maplibregl.ExpressionSpecification = ['==', ['get', 'notable'], 1];

/**
 * Adds the places source and its two circle layers. Circle layers need no fonts or sprites, so they draw on the blank
 * fallback style and on a saved street map.
 */
export function addPlaceLayers(map: maplibregl.Map): void {
  map.addSource(PLACE_SOURCE, {
    type: 'geojson',
    data: NO_PLACES,
    cluster: true,
    clusterMaxZoom: GROUP_MAX_ZOOM,
    clusterRadius: GROUP_RADIUS_PX,
    clusterProperties: { notable: ['max', ['get', 'notable']] },
  });
  map.addLayer({
    id: GROUP_LAYER,
    type: 'circle',
    source: PLACE_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['case', IS_NOTABLE, NOTABLE_COLOR, GROUP_COLOR],
      'circle-opacity': 0.85,
      'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 50, 22],
      'circle-stroke-color': ['case', IS_NOTABLE, NOTABLE_RING_COLOR, RING_COLOR],
      'circle-stroke-width': ['case', IS_NOTABLE, 3, 2],
    },
  });
  map.addLayer({
    id: PLACE_LAYER,
    type: 'circle',
    source: PLACE_SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: { 'circle-sort-key': ['get', 'notable'] },
    paint: {
      'circle-color': ['case', IS_NOTABLE, NOTABLE_COLOR, ['==', ['get', 'hotspot'], 1], HOTSPOT_COLOR, SIGHTING_COLOR],
      'circle-radius': ['case', IS_NOTABLE, 10, 7],
      'circle-stroke-color': ['case', IS_NOTABLE, NOTABLE_RING_COLOR, RING_COLOR],
      'circle-stroke-width': ['case', IS_NOTABLE, 3, 2],
    },
  });
}

export function showPlaces(map: maplibregl.Map, places: FeatureCollection<Point, MapPlaceProperties>): void {
  const source = map.getSource(PLACE_SOURCE);
  if (source instanceof maplibregl.GeoJSONSource) source.setData(places);
}

function nearestToTap(features: readonly maplibregl.MapGeoJSONFeature[], map: maplibregl.Map, tap: maplibregl.Point) {
  let nearest: maplibregl.MapGeoJSONFeature | null = null;
  let nearestDistance = Infinity;
  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue;
    const [lng, lat] = feature.geometry.coordinates;
    const distance = map.project([lng, lat]).dist(tap);
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function zoomIntoGroup(map: maplibregl.Map, group: maplibregl.MapGeoJSONFeature): void {
  const source = map.getSource(PLACE_SOURCE);
  const groupId: unknown = group.properties.cluster_id;
  if (!(source instanceof maplibregl.GeoJSONSource) || typeof groupId !== 'number') return;
  if (group.geometry.type !== 'Point') return;
  const [lng, lat] = group.geometry.coordinates;
  source
    .getClusterExpansionZoom(groupId)
    .then((zoom) => {
      // The location button keeps following the person through a move that zooms, so the next fix would pull the
      // map back. A move with no zoom first stops the following.
      map.jumpTo({ center: [lng, lat] });
      map.easeTo({ zoom });
    })
    // A refresh between the tap and the answer replaces the groups; the next tap uses the new ones.
    .catch(() => undefined);
}

/**
 * Handles taps on the map: a group zooms in until it splits, a place is picked, and empty map picks nothing.
 * @param onPick receives the tapped place's `locId`, or null for a tap away from every place
 */
export function handlePlaceTaps(map: maplibregl.Map, onPick: (locId: string | null) => void): void {
  map.on('click', ({ point }) => {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - TAP_SLOP_PX, point.y - TAP_SLOP_PX],
      [point.x + TAP_SLOP_PX, point.y + TAP_SLOP_PX],
    ];
    const hit = nearestToTap(map.queryRenderedFeatures(box, { layers: [GROUP_LAYER, PLACE_LAYER] }), map, point);
    if (!hit) {
      onPick(null);
      return;
    }
    if (hit.layer.id === GROUP_LAYER) {
      onPick(null);
      zoomIntoGroup(map, hit);
      return;
    }
    const locId: unknown = hit.properties.locId;
    onPick(typeof locId === 'string' ? locId : null);
  });
}
