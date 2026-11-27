import type { LngLatBox } from './areaOutline.ts';

export interface TileAddress {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

// Web Mercator, as MapLibre and OpenFreeMap tile it.
function tileColumn(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom);
}

function tileRow(lat: number, zoom: number): number {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom);
}

function clampToGrid(index: number, zoom: number): number {
  return Math.min(Math.max(index, 0), 2 ** zoom - 1);
}

/** @returns every tile from minZoom to maxZoom, inclusive, that touches the box */
export function tilesCoveringBox(box: LngLatBox, minZoom: number, maxZoom: number): TileAddress[] {
  const tiles: TileAddress[] = [];
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const west = clampToGrid(tileColumn(box.west, z), z);
    const east = clampToGrid(tileColumn(box.east, z), z);
    const north = clampToGrid(tileRow(box.north, z), z);
    const south = clampToGrid(tileRow(box.south, z), z);
    for (let x = west; x <= east; x += 1) {
      for (let y = north; y <= south; y += 1) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

export function tileUrl(template: string, { z, x, y }: TileAddress): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
