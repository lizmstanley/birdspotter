import { useMemo } from 'react';
import type { DistanceUnit } from './distanceUnit.ts';
import { ebirdChecklistUrl, type EbirdObservation } from './ebird.ts';
import type { LngLat, RegionTest } from './nearby.ts';
import type { LiveLocation } from './locationTracking.ts';
import { HotspotRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import type { RefreshMinutes } from './settings.ts';
import { hotspotsToVisit } from './suggestions.ts';
import type { NearbyData } from './useNearbyData.ts';

interface SuggestionsPanelProps {
  /** Hotspots outside the region are left out; null to suggest every hotspot. */
  readonly isInRegion: RegionTest | null;
  readonly data: NearbyData;
  readonly live: LiveLocation;
  /** The point the rows are measured from, or null to show no rows yet. */
  readonly origin: LngLat | null;
  readonly distanceUnit: DistanceUnit;
  readonly backDays: number;
  readonly refreshMinutes: RefreshMinutes;
  readonly onFixKey: () => void;
}

interface HotspotSpeciesProps {
  readonly species: readonly EbirdObservation[];
  readonly notableSpecies: ReadonlySet<string>;
}

function HotspotSpecies({ species, notableSpecies }: HotspotSpeciesProps) {
  if (species.length === 0) return <>No species reported here in that time</>;
  const byName = [...species].sort((a, b) => a.comName.localeCompare(b.comName));
  return (
    <details className="birding-hotspot-species">
      <summary>{species.length} species reported here</summary>
      <ul>
        {byName.map((sighting) => (
          <li key={sighting.speciesCode}>
            <a href={ebirdChecklistUrl(sighting.subId)} target="_blank" rel="noreferrer">
              {sighting.comName}
            </a>
            {notableSpecies.has(sighting.speciesCode) && <span className="birding-nearby-notable">Notable</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Hotspots worth a stop, each with the species reported there, from the sightings and hotspots already loaded. */
export function SuggestionsPanel({
  isInRegion,
  data,
  live,
  origin,
  distanceUnit,
  backDays,
  refreshMinutes,
  onFixKey,
}: SuggestionsPanelProps) {
  const hotspots = useMemo(
    () => (origin ? hotspotsToVisit(data.hotspots, [...data.regular, ...data.notable], origin, isInRegion) : []),
    [data.hotspots, data.regular, data.notable, origin, isInRegion]
  );
  const notableSpecies = useMemo(() => new Set(data.notable.map((sighting) => sighting.speciesCode)), [data.notable]);

  return (
    <section className="birding-panel birding-nearby" aria-label="Hotspots">
      <p className="birding-nearby-detail">
        From sightings in the last {backDays === 1 ? 'day' : `${backDays} days`}. Change that on the Sightings tab.
      </p>
      <NearbyStatus data={data} live={live} origin={origin} onFixKey={onFixKey} />
      {origin && (
        <>
          <h2>Hotspots to visit</h2>
          {hotspots.length === 0 && !data.isLoading && data.hotspotsFetchedAt !== null && <p>No eBird hotspots here.</p>}
          <ul className="birding-nearby-list">
            {hotspots.map(({ row, species }) => (
              <HotspotRow
                key={row.item.locId}
                row={row}
                reason={<HotspotSpecies species={species} notableSpecies={notableSpecies} />}
                distanceUnit={distanceUnit}
              />
            ))}
          </ul>
        </>
      )}
      <EbirdCredit refreshMinutes={refreshMinutes} hasNoSignal={data.hasNoSignal} />
    </section>
  );
}
