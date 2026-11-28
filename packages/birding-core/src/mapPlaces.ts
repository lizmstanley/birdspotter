import type { FeatureCollection, Point } from 'geojson';
import type { Place } from './nearby.ts';

export interface EbirdPlaceRecord extends Place {
  readonly locId: string;
  readonly locName: string;
}

export interface SpeciesReport extends EbirdPlaceRecord {
  readonly speciesCode: string;
  readonly comName: string;
}

/** One place on the map: a hotspot, a place with reports, or both. */
export interface MapPlace extends Place {
  readonly locId: string;
  readonly name: string;
  readonly isHotspot: boolean;
  /** Common names of the notable species reported here, each once, in report order. */
  readonly notableSpecies: readonly string[];
  /** Species reported here that are not notable. */
  readonly otherSpeciesCount: number;
}

export interface MapPlaceProperties {
  readonly locId: string;
  /** 1 or 0, so a group can carry the largest value of its places. */
  readonly notable: 0 | 1;
  readonly hotspot: 0 | 1;
}

interface PlaceBuilder {
  readonly place: EbirdPlaceRecord;
  isHotspot: boolean;
  readonly notable: Map<string, string>;
  readonly species: Set<string>;
}

function builderFor(builders: Map<string, PlaceBuilder>, record: EbirdPlaceRecord): PlaceBuilder {
  const existing = builders.get(record.locId);
  if (existing) return existing;
  const builder = { place: record, isHotspot: false, notable: new Map<string, string>(), species: new Set<string>() };
  builders.set(record.locId, builder);
  return builder;
}

/**
 * Merges eBird's lists into one place per `locId`. A place is notable when any notable report is there. A hotspot's
 * name and position win over a report's.
 */
export function mapPlaces(
  hotspots: readonly EbirdPlaceRecord[],
  regular: readonly SpeciesReport[],
  notable: readonly SpeciesReport[]
): MapPlace[] {
  const builders = new Map<string, PlaceBuilder>();
  // Hotspots go first, so each place keeps the hotspot's record.
  for (const hotspot of hotspots) builderFor(builders, hotspot).isHotspot = true;
  for (const report of notable) {
    const builder = builderFor(builders, report);
    builder.notable.set(report.speciesCode, report.comName);
    builder.species.add(report.speciesCode);
  }
  for (const report of regular) builderFor(builders, report).species.add(report.speciesCode);
  return [...builders.values()].map(({ place, isHotspot, notable: notableByCode, species }) => ({
    locId: place.locId,
    name: place.locName,
    lat: place.lat,
    lng: place.lng,
    isHotspot,
    notableSpecies: [...notableByCode.values()],
    otherSpeciesCount: species.size - notableByCode.size,
  }));
}

export function placeFeatures(places: readonly MapPlace[]): FeatureCollection<Point, MapPlaceProperties> {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: { locId: place.locId, notable: place.notableSpecies.length > 0 ? 1 : 0, hotspot: place.isHotspot ? 1 : 0 },
    })),
  };
}
