import { useMemo, type ReactNode } from 'react';
import { areaDisplayName } from '../../src/components/map/mapText.ts';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import type { EbirdObservation } from '../../src/services/ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import type { RefreshMinutes } from './scoutSettings.ts';
import { groupSightings, sortNearby, type NearbyRow, type Place } from './nearby.ts';
import { HotspotRow, SightingRow } from './NearbyRows.tsx';
import { EbirdCredit, NearbyStatus } from './NearbyStatus.tsx';
import type { NearbyData } from './useNearbyData.ts';

const BACK_DAY_CHOICES = Array.from({ length: 30 }, (_, index) => index + 1);

interface NearbyPanelProps {
  readonly area: AreaLinkData | null;
  readonly isInArea: ((place: Place) => boolean) | null;
  readonly data: NearbyData;
  readonly live: LiveLocation;
  readonly backDays: number;
  readonly onBackDaysChange: (backDays: number) => void;
  readonly refreshMinutes: RefreshMinutes;
  readonly onFixKey: () => void;
}

interface GroupTitles {
  readonly inArea: string;
  readonly elsewhere: string;
}

function groupTitles(area: AreaLinkData): GroupTitles {
  if (area.outline.type === 'LineString') return { inArea: 'In the circle', elsewhere: 'Outside the circle' };
  return { inArea: `In ${areaDisplayName(area.areaCode)}`, elsewhere: 'Outside your area' };
}

interface RowGroupsProps<T extends Place> {
  readonly rows: readonly NearbyRow<T>[];
  readonly titles: GroupTitles | null;
  readonly renderRow: (row: NearbyRow<T>) => ReactNode;
}

function RowGroups<T extends Place>({ rows, titles, renderRow }: RowGroupsProps<T>) {
  if (!titles) return <ul className="scout-nearby-list">{rows.map(renderRow)}</ul>;
  const inArea = rows.filter((row) => row.isInArea);
  const elsewhere = rows.filter((row) => !row.isInArea);
  return (
    <>
      {inArea.length > 0 && <h3>{titles.inArea}</h3>}
      <ul className="scout-nearby-list">{inArea.map(renderRow)}</ul>
      {elsewhere.length > 0 && <h3>{titles.elsewhere}</h3>}
      <ul className="scout-nearby-list">{elsewhere.map(renderRow)}</ul>
    </>
  );
}

function renderSighting(row: NearbyRow<EbirdObservation>, isNotable: boolean): ReactNode {
  return <SightingRow key={`${row.item.subId}-${row.item.speciesCode}`} row={row} isNotable={isNotable} />;
}

/** Notable sightings, then other recent sightings, then hotspots, each nearest first, with those in the person's area ahead of the rest. */
export function NearbyPanel({
  area,
  isInArea,
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
    return groupSightings(sortNearby(data.regular, position, isInArea), sortNearby(data.notable, position, isInArea));
  }, [data.regular, data.notable, position, isInArea]);
  const hotspots = useMemo(
    () => (position ? sortNearby(data.hotspots, position, isInArea) : []),
    [data.hotspots, position, isInArea]
  );
  const titles = area ? groupTitles(area) : null;

  return (
    <section className="scout-area scout-nearby" aria-label="Nearby">
      <label className="scout-nearby-days">
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
              <RowGroups rows={sightings.notable} titles={titles} renderRow={(row) => renderSighting(row, true)} />
            </>
          )}
          <h2>Recent sightings</h2>
          {sightings.regular.length === 0 && !data.isLoading && data.sightingsFetchedAt !== null && (
            <p>{sightings.notable.length > 0 ? 'No other' : 'No'} sightings reported here in that time.</p>
          )}
          <RowGroups rows={sightings.regular} titles={titles} renderRow={(row) => renderSighting(row, false)} />
          <h2>Hotspots</h2>
          {hotspots.length === 0 && !data.isLoading && data.hotspotsFetchedAt !== null && <p>No eBird hotspots here.</p>}
          <RowGroups rows={hotspots} titles={titles} renderRow={(row) => <HotspotRow key={row.item.locId} row={row} />} />
        </>
      )}
      <EbirdCredit refreshMinutes={refreshMinutes} hasNoSignal={data.hasNoSignal} />
    </section>
  );
}
