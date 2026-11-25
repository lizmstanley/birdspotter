import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAP_STYLE_URL, fallBackToBlankBasemap } from './basemap.ts';

type Handler = () => void;
type BasemapMap = Parameters<typeof fallBackToBlankBasemap>[0];

function fakeMap() {
  const handlers: Record<string, Handler[]> = {};
  const styles: unknown[] = [];
  const listen = (event: string, handler: Handler) => {
    (handlers[event] ??= []).push(handler);
  };
  return {
    map: { once: listen, on: listen, setStyle: (style: unknown) => styles.push(style) },
    emit: (event: string) => handlers[event]?.forEach((handler) => handler()),
    styles,
  };
}

test('basemap loads the OpenFreeMap liberty style', () => {
  assert.equal(BASEMAP_STYLE_URL, 'https://tiles.openfreemap.org/styles/liberty');
});

test('a map whose basemap style fails gets a blank style so it can still load', () => {
  const fake = fakeMap();
  fallBackToBlankBasemap(fake.map as unknown as BasemapMap);
  fake.emit('error');
  assert.deepEqual(fake.styles, [{ version: 8, sources: {}, layers: [] }]);
});

test('an error after the basemap style loaded keeps the basemap', () => {
  const fake = fakeMap();
  fallBackToBlankBasemap(fake.map as unknown as BasemapMap);
  fake.emit('style.load');
  fake.emit('error');
  assert.deepEqual(fake.styles, []);
});
