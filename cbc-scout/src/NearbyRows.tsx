import {
  ebirdChecklistUrl,
  isConfirmedReport,
  type EbirdHotspot,
  type EbirdObservation,
} from '../../src/services/ebird.ts';
import { directionsUrl } from './directions.ts';
import { formatDistance, type NearbyRow, type Place } from './nearby.ts';

interface SightingRowProps {
  readonly row: NearbyRow<EbirdObservation>;
  readonly isNotable: boolean;
  readonly reason?: string;
}

function sightingRowClass(isNotable: boolean, isConfirmed: boolean): string {
  if (!isNotable) return 'scout-nearby-row';
  if (!isConfirmed) return 'scout-nearby-row scout-nearby-row-notable';
  return 'scout-nearby-row scout-nearby-row-notable scout-nearby-row-confirmed';
}

export function SightingRow({ row, isNotable, reason }: SightingRowProps) {
  const { comName, howMany, locName, obsDt, subId } = row.item;
  const isConfirmed = isNotable && isConfirmedReport(row.item);
  return (
    <li className={sightingRowClass(isNotable, isConfirmed)}>
      <a className="scout-nearby-place" href={ebirdChecklistUrl(subId)} target="_blank" rel="noreferrer">
        {isNotable && <span className="scout-nearby-notable">Notable</span>}
        {isConfirmed && <span className="scout-nearby-confirmed">Confirmed</span>}
        <strong>{comName}</strong> <span className="scout-nearby-count">{howMany ?? 'X'}</span>
        <div className="scout-nearby-detail">
          {locName}, {obsDt}
        </div>
        {reason && <div className="scout-nearby-reason">{reason}</div>}
      </a>
      <PlaceWhere row={row} placeName={locName} />
    </li>
  );
}

interface HotspotRowProps {
  readonly row: NearbyRow<EbirdHotspot>;
  readonly reason?: string;
}

export function HotspotRow({ row, reason }: HotspotRowProps) {
  return (
    <li className="scout-nearby-row">
      <div className="scout-nearby-place">
        <strong>{row.item.locName}</strong>
        {reason && <div className="scout-nearby-reason">{reason}</div>}
      </div>
      <PlaceWhere row={row} placeName={row.item.locName} />
    </li>
  );
}

interface PlaceWhereProps {
  readonly row: NearbyRow<Place>;
  readonly placeName: string;
}

function PlaceWhere({ row, placeName }: PlaceWhereProps) {
  const distance = formatDistance(row.miles);
  return (
    <div className="scout-nearby-where">
      <span className="scout-nearby-distance">{row.direction ? `${distance} ${row.direction}` : distance}</span>
      <a
        className="scout-nearby-directions"
        href={directionsUrl(row.item, navigator.userAgent, navigator.maxTouchPoints)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Directions to ${placeName}`}
      >
        Directions
      </a>
    </div>
  );
}
