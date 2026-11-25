import { useMemo } from 'react';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import { formatDistance, type Place } from './nearby.ts';
import type { LiveLocation } from './locationTracking.ts';
import { HotspotRow, SightingRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import type { RefreshMinutes } from './scoutSettings.ts';
import { birdsToLookFor, hotspotsToVisit } from './suggestions.ts';
import type { NearbyData } from './useNearbyData.ts';

interface SuggestionsPanelProps {
  readonly area: AreaLinkData | null;
  readonly isInArea: ((place: Place) => boolean) | null;
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

/** Hotspots worth a stop and birds to watch for, from the sightings and hotspots the Nearby tab loaded. */
export function SuggestionsPanel({
  area,
  isInArea,
  data,
  live,
  backDays,
  refreshMinutes,
  onFixKey,
}: SuggestionsPanelProps) {
  const { position } = live;
  // A route's stand-in region is the whole circle, the same circle the sightings come from, so nothing is outside it.
  const birdsIsInArea = area?.outline.type === 'LineString' ? null : isInArea;
  const hotspots = useMemo(
    () => (position ? hotspotsToVisit(data.hotspots, [...data.regular, ...data.notable], position, isInArea) : []),
    [data.hotspots, data.regular, data.notable, position, isInArea]
  );
  const birds = useMemo(
    () => (position && birdsIsInArea ? birdsToLookFor(data.regular, data.notable, position, birdsIsInArea) : []),
    [data.regular, data.notable, position, birdsIsInArea]
  );

  return (
    <section className="scout-area scout-nearby" aria-label="Suggestions">
      <p className="scout-nearby-detail">
        From sightings in the last {backDays === 1 ? 'day' : `${backDays} days`}. Change that on the Nearby tab.
      </p>
      <NearbyStatus data={data} live={live} onFixKey={onFixKey} />
      {position && (
        <>
          <h2>Hotspots to visit</h2>
          {hotspots.length === 0 && !data.isLoading && data.hotspotsFetchedAt !== null && <p>No eBird hotspots here.</p>}
          <ul className="scout-nearby-list">
            {hotspots.map(({ row, speciesCount }) => (
              <HotspotRow key={row.item.locId} row={row} reason={hotspotReason(speciesCount)} />
            ))}
          </ul>
          {birdsIsInArea && (
            <>
              <h2>Birds to look for</h2>
              {birds.length === 0 && !data.isLoading && data.sightingsFetchedAt !== null && (
                <p>No species last reported outside your area in that time.</p>
              )}
              <ul className="scout-nearby-list">
                {birds.map(({ row, isNotable }) => (
                  <SightingRow
                    key={`${row.item.subId}-${row.item.speciesCode}`}
                    row={row}
                    isNotable={isNotable}
                    reason={`Last reported ${formatDistance(row.miles)} away, outside your area`}
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
