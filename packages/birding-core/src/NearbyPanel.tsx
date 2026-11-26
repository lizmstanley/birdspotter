import { useMemo, type ReactNode } from 'react';
import type { EbirdObservation } from './ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import type { RefreshMinutes } from './settings.ts';
import { groupSightings, sortNearby, type NearbyRow, type Place, type RegionTest } from './nearby.ts';
import { HotspotRow, SightingRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import type { NearbyData } from './useNearbyData.ts';

const BACK_DAY_CHOICES = Array.from({ length: 30 }, (_, index) => index + 1);

/** Headings for the places in the region and the rest. */
export interface GroupTitles {
  readonly inRegion: string;
  readonly elsewhere: string;
}

interface NearbyPanelProps {
  readonly isInRegion: RegionTest | null;
  /** Null to list every place in one group, as when there is no region. */
  readonly groupTitles: GroupTitles | null;
  readonly data: NearbyData;
  readonly live: LiveLocation;
  readonly backDays: number;
  readonly onBackDaysChange: (backDays: number) => void;
  readonly refreshMinutes: RefreshMinutes;
  readonly onFixKey: () => void;
}

interface RowGroupsProps<T extends Place> {
  readonly rows: readonly NearbyRow<T>[];
  readonly titles: GroupTitles | null;
  readonly renderRow: (row: NearbyRow<T>) => ReactNode;
}

function RowGroups<T extends Place>({ rows, titles, renderRow }: RowGroupsProps<T>) {
  if (!titles) return <ul className="birding-nearby-list">{rows.map(renderRow)}</ul>;
  const inRegion = rows.filter((row) => row.isInRegion);
  const elsewhere = rows.filter((row) => !row.isInRegion);
  return (
    <>
      {inRegion.length > 0 && <h3>{titles.inRegion}</h3>}
      <ul className="birding-nearby-list">{inRegion.map(renderRow)}</ul>
      {elsewhere.length > 0 && <h3>{titles.elsewhere}</h3>}
      <ul className="birding-nearby-list">{elsewhere.map(renderRow)}</ul>
    </>
  );
}

function renderSighting(row: NearbyRow<EbirdObservation>, isNotable: boolean): ReactNode {
  return <SightingRow key={`${row.item.subId}-${row.item.speciesCode}`} row={row} isNotable={isNotable} />;
}

/** Notable sightings, then other recent sightings, then hotspots, each nearest first, with those in the region ahead of the rest. */
export function NearbyPanel({
  isInRegion,
  groupTitles,
  data,
  live,
  backDays,
  onBackDaysChange,
  refreshMinutes,
  onFixKey,
}: NearbyPanelProps) {
  const { position } = live;
  const sightings = useMemo(() => {
    if (!position) return groupSightings<EbirdObservation>([], []);
    return groupSightings(sortNearby(data.regular, position, isInRegion), sortNearby(data.notable, position, isInRegion));
  }, [data.regular, data.notable, position, isInRegion]);
  const hotspots = useMemo(
    () => (position ? sortNearby(data.hotspots, position, isInRegion) : []),
    [data.hotspots, position, isInRegion]
  );

  return (
    <section className="birding-panel birding-nearby" aria-label="Sightings">
      <label className="birding-nearby-days">
        Sightings from the last{' '}
        <select value={backDays} onChange={(event) => onBackDaysChange(Number(event.target.value))}>
          {BACK_DAY_CHOICES.map((days) => (
            <option key={days} value={days}>
              {days === 1 ? '1 day' : `${days} days`}
            </option>
          ))}
        </select>
      </label>
      <NearbyStatus data={data} live={live} onFixKey={onFixKey} />
      {position && (
        <>
          {sightings.notable.length > 0 && (
            <>
              <h2>Notable sightings</h2>
              <RowGroups rows={sightings.notable} titles={groupTitles} renderRow={(row) => renderSighting(row, true)} />
            </>
          )}
          <h2>Recent sightings</h2>
          {sightings.regular.length === 0 && !data.isLoading && data.sightingsFetchedAt !== null && (
            <p>{sightings.notable.length > 0 ? 'No other' : 'No'} sightings reported here in that time.</p>
          )}
          <RowGroups rows={sightings.regular} titles={groupTitles} renderRow={(row) => renderSighting(row, false)} />
          <h2>Hotspots</h2>
          {hotspots.length === 0 && !data.isLoading && data.hotspotsFetchedAt !== null && <p>No eBird hotspots here.</p>}
          <RowGroups rows={hotspots} titles={groupTitles} renderRow={(row) => <HotspotRow key={row.item.locId} row={row} />} />
        </>
      )}
      <EbirdCredit refreshMinutes={refreshMinutes} hasNoSignal={data.hasNoSignal} />
    </section>
  );
}
