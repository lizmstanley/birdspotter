import { useMemo, useState, type ReactNode } from 'react';
import { areaDisplayName } from '../../src/components/map/mapText.ts';
import type { AreaLinkData } from '../../src/services/areaLink.ts';
import { buildCirclePolygon, EBIRD_SITE_URL, type EbirdObservation } from '../../src/services/ebird.ts';
import type { LiveLocation } from './locationTracking.ts';
import { refreshIntervalText, type RefreshMinutes } from './scoutSettings.ts';
import { groupSightings, isInAreaTest, sortNearby, type NearbyRow, type Place } from './nearby.ts';
import { HotspotRow, SightingRow } from './NearbyRows.tsx';
import { useNearbyData } from './useNearbyData.ts';

const DEFAULT_BACK_DAYS = 7;
const BACK_DAY_CHOICES = Array.from({ length: 30 }, (_, index) => index + 1);

interface NearbyPanelProps {
  readonly apiKey: string;
  readonly area: AreaLinkData | null;
  readonly live: LiveLocation;
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

function waitingText(live: LiveLocation): string {
  if (live.error) return live.error;
  if (live.isTracking) return 'Finding your location…';
  return 'Turn on location with the location button on the map to see what is nearby.';
}

/** Notable sightings, then other recent sightings, then hotspots, each nearest first, with those in the person's area ahead of the rest. */
export function NearbyPanel({ apiKey, area, live, refreshMinutes, onFixKey }: NearbyPanelProps) {
  const [backDays, setBackDays] = useState(DEFAULT_BACK_DAYS);
  const { position } = live;
  const data = useNearbyData(apiKey, area, position, backDays, refreshMinutes * 60 * 1000);
  const isInArea = useMemo(() => {
    if (!area) return null;
    return isInAreaTest(area, buildCirclePolygon(area.circleCenter[0], area.circleCenter[1]));
  }, [area]);
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
        <select value={backDays} onChange={(event) => setBackDays(Number(event.target.value))}>
          {BACK_DAY_CHOICES.map((days) => (
            <option key={days} value={days}>
              {days === 1 ? '1 day' : `${days} days`}
            </option>
          ))}
        </select>
      </label>
      {data.isKeyRejected && (
        <div className="scout-nearby-error" role="alert">
          <p>eBird rejected your API key. Fix it under eBird key in the menu.</p>
          <button type="button" onClick={onFixKey}>
            Fix eBird key
          </button>
        </div>
      )}
      {data.error && !data.isKeyRejected && (
        <p className="scout-nearby-error" role="alert">
          {data.error}
        </p>
      )}
      {!position && <p role="status">{waitingText(live)}</p>}
      {position && data.isLoading && <p role="status">Loading eBird data…</p>}
      {position && (
        <>
          {sightings.notable.length > 0 && (
            <>
              <h2>Notable sightings</h2>
              <RowGroups rows={sightings.notable} titles={titles} renderRow={(row) => renderSighting(row, true)} />
            </>
          )}
          <h2>Recent sightings</h2>
          {sightings.regular.length === 0 && !data.isLoading && (
            <p>{sightings.notable.length > 0 ? 'No other' : 'No'} sightings reported here in that time.</p>
          )}
          <RowGroups rows={sightings.regular} titles={titles} renderRow={(row) => renderSighting(row, false)} />
          <h2>Hotspots</h2>
          {hotspots.length === 0 && !data.isLoading && <p>No eBird hotspots here.</p>}
          <RowGroups rows={hotspots} titles={titles} renderRow={(row) => <HotspotRow key={row.item.locId} row={row} />} />
        </>
      )}
      <p className="scout-nearby-credit">
        Bird data from{' '}
        <a href={EBIRD_SITE_URL} target="_blank" rel="noreferrer">
          eBird.org
        </a>
        , checked {refreshIntervalText(refreshMinutes)}.
      </p>
    </section>
  );
}
