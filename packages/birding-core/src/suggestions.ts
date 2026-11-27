import { sortNearby, type LngLat, type NearbyRow, type Place, type RegionTest, type Sighting } from './nearby.ts';

export interface HotspotPlace extends Place {
  readonly locId: string;
}

export interface ReportedSighting extends Sighting {
  readonly locId: string;
  /** eBird's local "YYYY-MM-DD HH:mm" or "YYYY-MM-DD", compared as text, so a same-day report with no time sorts first. */
  readonly obsDt: string;
}

export interface HotspotSuggestion<H extends HotspotPlace, S extends ReportedSighting> {
  readonly row: NearbyRow<H>;
  /** Each species reported at the hotspot once, at its latest report there. */
  readonly species: readonly S[];
}

function latestReports<S extends ReportedSighting>(sightings: readonly S[]): S[] {
  const latestBySpecies = new Map<string, S>();
  for (const sighting of sightings) {
    const latest = latestBySpecies.get(sighting.speciesCode);
    if (!latest || sighting.obsDt > latest.obsDt) latestBySpecies.set(sighting.speciesCode, sighting);
  }
  return [...latestBySpecies.values()];
}

function sightingsByLocId<S extends ReportedSighting>(sightings: readonly S[]): Map<string, S[]> {
  const byLocId = new Map<string, S[]>();
  for (const sighting of sightings) {
    byLocId.set(sighting.locId, [...(byLocId.get(sighting.locId) ?? []), sighting]);
  }
  return byLocId;
}

/**
 * Hotspots worth a stop: those in the region, or every hotspot when there is no region, most species first, ties
 * nearest first. A hotspot with no reports sorts last.
 * @param sightings regular and notable reports together
 */
export function hotspotsToVisit<H extends HotspotPlace, S extends ReportedSighting>(
  hotspots: readonly H[],
  sightings: readonly S[],
  position: LngLat,
  isInRegion: RegionTest | null
): HotspotSuggestion<H, S>[] {
  const byLocId = sightingsByLocId(sightings);
  const rows = sortNearby(hotspots, position, isInRegion).filter((row) => !isInRegion || row.isInRegion);
  return rows
    .map((row) => ({ row, species: latestReports(byLocId.get(row.item.locId) ?? []) }))
    .sort((a, b) => b.species.length - a.species.length || a.row.miles - b.row.miles);
}
