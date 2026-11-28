import { useMemo, useState, type ReactNode } from 'react';
import type { DistanceUnit } from './distanceUnit.ts';
import type { EbirdObservation } from './ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import { BACK_DAY_CHOICES, type RefreshMinutes } from './settings.ts';
import {
  findSpecies,
  groupSightings,
  isRecentSightingsHidden,
  noRecentSightingsText,
  sortNearby,
  speciesSearchKey,
  type LngLat,
  type NearbyRow,
  type Place,
  type RegionTest,
} from './nearby.ts';
import { SightingRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import { useMinuteClock } from './useMinuteClock.ts';
import type { NearbyData } from './useNearbyData.ts';

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
  /** The point the rows are measured from, or null to show no rows yet. */
  readonly origin: LngLat | null;
  readonly distanceUnit: DistanceUnit;
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

function renderSighting(
  row: NearbyRow<EbirdObservation>,
  isNotable: boolean,
  now: Date,
  distanceUnit: DistanceUnit
): ReactNode {
  return (
    <SightingRow
      key={`${row.item.subId}-${row.item.speciesCode}`}
      row={row}
      isNotable={isNotable}
      now={now}
      distanceUnit={distanceUnit}
    />
  );
}

/** Notable sightings, then other recent sightings, each nearest first, with those in the region ahead of the rest. */
export function NearbyPanel({
  isInRegion,
  groupTitles,
  data,
  live,
  origin,
  distanceUnit,
  backDays,
  onBackDaysChange,
  refreshMinutes,
  onFixKey,
}: NearbyPanelProps) {
  const now = useMinuteClock();
  const sightings = useMemo(() => {
    if (!origin) return groupSightings<EbirdObservation>([], []);
    return groupSightings(sortNearby(data.regular, origin, isInRegion), sortNearby(data.notable, origin, isInRegion));
  }, [data.regular, data.notable, origin, isInRegion]);
  const [search, setSearch] = useState('');
  const searchKey = speciesSearchKey(search);
  const shown = useMemo(() => findSpecies(sightings, searchKey), [sightings, searchKey]);

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
      <NearbyStatus data={data} live={live} origin={origin} onFixKey={onFixKey} />
      {origin && (
        <>
          <label className="birding-nearby-search">
            Find a species
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          {shown.notable.length > 0 && (
            <>
              <h2>Notable sightings</h2>
              <RowGroups
                rows={shown.notable}
                titles={groupTitles}
                renderRow={(row) => renderSighting(row, true, now, distanceUnit)}
              />
            </>
          )}
          {!isRecentSightingsHidden(shown, search) && (
            <>
              <h2>Recent sightings</h2>
              {shown.regular.length === 0 && !data.isLoading && data.sightingsFetchedAt !== null && (
                <p>{noRecentSightingsText(shown, search)}</p>
              )}
              <RowGroups
                rows={shown.regular}
                titles={groupTitles}
                renderRow={(row) => renderSighting(row, false, now, distanceUnit)}
              />
            </>
          )}
        </>
      )}
      <EbirdCredit refreshMinutes={refreshMinutes} hasNoSignal={data.hasNoSignal} />
    </section>
  );
}
