import { ebirdChecklistUrl, type EbirdHotspot, type EbirdObservation } from '../../src/services/ebird.ts';
import { formatDistance, type NearbyRow } from './nearby.ts';

interface SightingRowProps {
  readonly row: NearbyRow<EbirdObservation>;
  readonly isNotable: boolean;
}

export function SightingRow({ row, isNotable }: SightingRowProps) {
  const { comName, howMany, locName, obsDt, subId } = row.item;
  const className = isNotable ? 'scout-nearby-row scout-nearby-row-notable' : 'scout-nearby-row';
  return (
    <li>
      <a className={className} href={ebirdChecklistUrl(subId)} target="_blank" rel="noreferrer">
        <div>
          {isNotable && <span className="scout-nearby-notable">Notable</span>}
          <strong>{comName}</strong> <span className="scout-nearby-count">{howMany ?? 'X'}</span>
          <div className="scout-nearby-detail">
            {locName}, {obsDt}
          </div>
        </div>
        <span className="scout-nearby-distance">{formatDistance(row.miles)}</span>
      </a>
    </li>
  );
}

export function HotspotRow({ row }: { readonly row: NearbyRow<EbirdHotspot> }) {
  return (
    <li className="scout-nearby-row">
      <strong>{row.item.locName}</strong>
      <span className="scout-nearby-distance">{formatDistance(row.miles)}</span>
    </li>
  );
}
