import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { addAreaLayers, addCircleLayers } from './mapLayers.ts';

function recordingMap() {
  const sources: string[] = [];
  const layers: Array<{ id: string; source: string }> = [];
  const map = {
    addSource: (id: string) => sources.push(id),
    addLayer: (layer: { id: string; source: string }) => layers.push(layer),
  } as unknown as MapLibreMap;
  return { map, sources, layers };
}

test('every layer reads from a source added before it', () => {
  const { map, sources, layers } = recordingMap();
  addCircleLayers(map);
  addAreaLayers(map);
  for (const layer of layers) {
    assert.ok(sources.includes(layer.source), `${layer.id} reads ${layer.source}`);
  }
});

test('area outline draws above the fill and its white halo', () => {
  const { map, layers } = recordingMap();
  addAreaLayers(map);
  assert.deepEqual(
    layers.map((l) => l.id),
    ['cbc-areas-fill', 'cbc-areas-outline-halo', 'cbc-areas-outline']
  );
});
