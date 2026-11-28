import type { ReactNode } from 'react';
import {
  ebirdChecklistUrl,
  isConfirmedReport,
  type EbirdHotspot,
  type EbirdObservation,
} from './ebird.ts';
import { directionsUrl } from './directions.ts';
import type { DistanceUnit } from './distanceUnit.ts';
import { formatDistance, type NearbyRow, type Place } from './nearby.ts';
import { sightingAgeText } from './sightingAge.ts';

interface SightingRowProps {
  readonly row: NearbyRow<EbirdObservation>;
  readonly isNotable: boolean;
  readonly reason?: string;
  readonly now: Date;
  readonly distanceUnit: DistanceUnit;
}

function sightingRowClass(isNotable: boolean, isConfirmed: boolean): string {
  if (!isNotable) return 'birding-nearby-row';
  if (!isConfirmed) return 'birding-nearby-row birding-nearby-row-notable';
  return 'birding-nearby-row birding-nearby-row-notable birding-nearby-row-confirmed';
}

export function SightingRow({ row, isNotable, reason, now, distanceUnit }: SightingRowProps) {
  const { comName, howMany, locName, obsDt, subId } = row.item;
  const isConfirmed = isNotable && isConfirmedReport(row.item);
  return (
    <li className={sightingRowClass(isNotable, isConfirmed)}>
      <a className="birding-nearby-place" href={ebirdChecklistUrl(subId)} target="_blank" rel="noreferrer">
        {isNotable && <span className="birding-nearby-notable">Notable</span>}
        {isConfirmed && <span className="birding-nearby-confirmed">Confirmed</span>}
        <strong>{comName}</strong> <span className="birding-nearby-count">{howMany ?? 'X'}</span>
        <div className="birding-nearby-detail">
          {locName}, {sightingAgeText(obsDt, now) ?? obsDt}
        </div>
        {reason && <div className="birding-nearby-reason">{reason}</div>}
      </a>
      <PlaceWhere row={row} placeName={locName} distanceUnit={distanceUnit} />
    </li>
  );
}

interface HotspotRowProps {
  readonly row: NearbyRow<EbirdHotspot>;
  readonly reason?: ReactNode;
  readonly distanceUnit: DistanceUnit;
}

export function HotspotRow({ row, reason, distanceUnit }: HotspotRowProps) {
  return (
    <li className="birding-nearby-row">
      <div className="birding-nearby-place">
        <strong>{row.item.locName}</strong>
        {reason && <div className="birding-nearby-reason">{reason}</div>}
      </div>
      <PlaceWhere row={row} placeName={row.item.locName} distanceUnit={distanceUnit} />
    </li>
  );
}

interface PlaceWhereProps {
  readonly row: NearbyRow<Place>;
  readonly placeName: string;
  readonly distanceUnit: DistanceUnit;
}

export function PlaceWhere({ row, placeName, distanceUnit }: PlaceWhereProps) {
  const distance = formatDistance(row.miles, distanceUnit);
  return (
    <div className="birding-nearby-where">
      <span className="birding-nearby-distance">{row.direction ? `${distance} ${row.direction}` : distance}</span>
      <a
        className="birding-nearby-directions"
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
