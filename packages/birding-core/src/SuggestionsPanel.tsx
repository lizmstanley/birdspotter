import { useMemo } from 'react';
import { formatDistance, type RegionTest } from './nearby.ts';
import type { LiveLocation } from './locationTracking.ts';
import { HotspotRow, SightingRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import type { RefreshMinutes } from './settings.ts';
import { birdsToLookFor, hotspotsToVisit } from './suggestions.ts';
import type { NearbyData } from './useNearbyData.ts';

/** The region birds are looked for outside of, and how to name what lies outside it. */
export interface BirdsRegion {
  readonly isInRegion: RegionTest;
  /** Ends "Last reported 2.1 mi away, …", as in "outside the park". */
  readonly outsideText: string;
}

interface SuggestionsPanelProps {
  /** Hotspots outside the region are left out; null to suggest every hotspot. */
  readonly isInRegion: RegionTest | null;
  /** Null to leave out Birds to look for. */
  readonly birdsRegion: BirdsRegion | null;
  readonly data: NearbyData;
  readonly live: LiveLocation;
  readonly backDays: number;
  readonly refreshMinutes: RefreshMinutes;
  readonly onFixKey: () => void;
}

function hotspotReason(speciesCount: number): string {
  if (speciesCount === 0) return 'No species last reported here in that time';
  return `${speciesCount} species last reported here`;
}

/** Hotspots worth a stop and birds to watch for, from the sightings and hotspots the Sightings tab loaded. */
export function SuggestionsPanel({
  isInRegion,
  birdsRegion,
  data,
  live,
  backDays,
  refreshMinutes,
  onFixKey,
}: SuggestionsPanelProps) {
  const { position } = live;
  const hotspots = useMemo(
    () => (position ? hotspotsToVisit(data.hotspots, [...data.regular, ...data.notable], position, isInRegion) : []),
    [data.hotspots, data.regular, data.notable, position, isInRegion]
  );
  const birdsIsInRegion = birdsRegion?.isInRegion ?? null;
  const birds = useMemo(
    () => (position && birdsIsInRegion ? birdsToLookFor(data.regular, data.notable, position, birdsIsInRegion) : []),
    [data.regular, data.notable, position, birdsIsInRegion]
  );

  return (
    <section className="birding-panel birding-nearby" aria-label="Hotspots">
      <p className="birding-nearby-detail">
        From sightings in the last {backDays === 1 ? 'day' : `${backDays} days`}. Change that on the Sightings tab.
      </p>
      <NearbyStatus data={data} live={live} onFixKey={onFixKey} />
      {position && (
        <>
          <h2>Hotspots to visit</h2>
          {hotspots.length === 0 && !data.isLoading && data.hotspotsFetchedAt !== null && <p>No eBird hotspots here.</p>}
          <ul className="birding-nearby-list">
            {hotspots.map(({ row, speciesCount }) => (
              <HotspotRow key={row.item.locId} row={row} reason={hotspotReason(speciesCount)} />
            ))}
          </ul>
          {birdsRegion && (
            <>
              <h2>Birds to look for</h2>
              {birds.length === 0 && !data.isLoading && data.sightingsFetchedAt !== null && (
                <p>No species last reported {birdsRegion.outsideText} in that time.</p>
              )}
              <ul className="birding-nearby-list">
                {birds.map(({ row, isNotable }) => (
                  <SightingRow
                    key={`${row.item.subId}-${row.item.speciesCode}`}
                    row={row}
                    isNotable={isNotable}
                    reason={`Last reported ${formatDistance(row.miles)} away, ${birdsRegion.outsideText}`}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <EbirdCredit refreshMinutes={refreshMinutes} hasNoSignal={data.hasNoSignal} />
    </section>
  );
}
