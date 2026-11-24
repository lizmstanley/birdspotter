import type { EbirdHotspot, EbirdObservation } from '../../src/services/ebird.ts';
import { formatDistance, type NearbyRow } from './nearby.ts';

export function SightingRow({ row }: { readonly row: NearbyRow<EbirdObservation> }) {
  const { comName, howMany, locName, obsDt } = row.item;
  return (
    <li className="scout-nearby-row">
      <div>
        <strong>{comName}</strong> <span className="scout-nearby-count">{howMany ?? 'X'}</span>
        <div className="scout-nearby-detail">
          {locName}, {obsDt}
        </div>
      </div>
      <span className="scout-nearby-distance">{formatDistance(row.miles)}</span>
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
