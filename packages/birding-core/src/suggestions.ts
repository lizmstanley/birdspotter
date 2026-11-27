import { sortNearby, type LngLat, type NearbyRow, type Place, type RegionTest, type Sighting } from './nearby.ts';

export interface HotspotPlace extends Place {
  readonly locId: string;
}

export interface ReportedSighting extends Sighting {
  readonly locId: string;
  /** eBird's local "YYYY-MM-DD HH:mm" or "YYYY-MM-DD", compared as text, so a same-day report with no time sorts first. */
  readonly obsDt: string;
}

export interface HotspotSuggestion<T extends HotspotPlace> {
  readonly row: NearbyRow<T>;
  readonly speciesCount: number;
}

export interface BirdSuggestion<T extends ReportedSighting> {
  readonly row: NearbyRow<T>;
  readonly isNotable: boolean;
}

function latestReports<S extends ReportedSighting>(sightings: readonly S[]): S[] {
  const latestBySpecies = new Map<string, S>();
  for (const sighting of sightings) {
    const latest = latestBySpecies.get(sighting.speciesCode);
    if (!latest || sighting.obsDt > latest.obsDt) latestBySpecies.set(sighting.speciesCode, sighting);
  }
  return [...latestBySpecies.values()];
}

/**
 * Hotspots worth a stop: those in the region, or every hotspot when there is no region, most species first, ties
 * nearest first. A species counts toward the hotspot of its latest loaded report, so a hotspot with none sorts last.
 * @param sightings regular and notable reports together
 */
export function hotspotsToVisit<H extends HotspotPlace>(
  hotspots: readonly H[],
  sightings: readonly ReportedSighting[],
  position: LngLat,
  isInRegion: RegionTest | null
): HotspotSuggestion<H>[] {
  const speciesCountByLocId = new Map<string, number>();
  for (const { locId } of latestReports(sightings)) {
    speciesCountByLocId.set(locId, (speciesCountByLocId.get(locId) ?? 0) + 1);
  }
  const rows = sortNearby(hotspots, position, isInRegion).filter((row) => !isInRegion || row.isInRegion);
  return rows
    .map((row) => ({ row, speciesCount: speciesCountByLocId.get(row.item.locId) ?? 0 }))
    .sort((a, b) => b.speciesCount - a.speciesCount || a.row.miles - b.row.miles);
}

/**
 * Species reported in the region, each at its latest report there, nearest first.
 * @param notable eBird's notable reports, which mark a species as notable and may hold a later report than regular
 */
export function birdsToLookFor<S extends ReportedSighting>(
  regular: readonly S[],
  notable: readonly S[],
  position: LngLat,
  isInRegion: RegionTest
): BirdSuggestion<S>[] {
  const notableSpecies = new Set(notable.map((sighting) => sighting.speciesCode));
  const reportsInRegion = [...regular, ...notable].filter(isInRegion);
  return sortNearby(latestReports(reportsInRegion), position, isInRegion).map((row) => ({
    row,
    isNotable: notableSpecies.has(row.item.speciesCode),
  }));
}
