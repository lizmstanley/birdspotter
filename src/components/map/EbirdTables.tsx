import type { EbirdHotspot, EbirdObservation } from '../../services/ebird.ts';
import { EbirdCredit } from './EbirdCredit.tsx';
import { areaLabel } from './mapText.ts';

export type WithArea<T> = T & { area: string | null };

interface TableProps<T> {
  readonly circleCode: string;
  readonly rows: WithArea<T>[];
  readonly hasAreas: boolean;
}

export function SightingsTable({ circleCode, rows, hasAreas }: TableProps<EbirdObservation>) {
  return (
    <details className="card collapsible-card">
      <summary>
        <h2>Recent eBird Sightings Inside {circleCode} ({rows.length} species)</h2>
      </summary>
      <table>
        <thead>
          <tr>
            <th>Species</th>
            <th>Count</th>
            {hasAreas && <th>Area</th>}
            <th>Location</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={`${s.subId}-${s.speciesCode}`}>
              <td><strong>{s.comName}</strong></td>
              <td>{s.howMany ?? 'X'}</td>
              {hasAreas && <td>{areaLabel(s.area)}</td>}
              <td>{s.locName}</td>
              <td>{s.obsDt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <EbirdCredit />
    </details>
  );
}

export function HotspotsTable({ circleCode, rows, hasAreas }: TableProps<EbirdHotspot>) {
  return (
    <details className="card collapsible-card">
      <summary>
        <h2>eBird Hotspots Inside {circleCode} ({rows.length})</h2>
      </summary>
      <table>
        <thead>
          <tr>
            <th>Hotspot</th>
            {hasAreas && <th>Area</th>}
            <th>All-Time Species</th>
            <th>Latest Checklist</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.locId}>
              <td>
                <a href={`https://ebird.org/hotspot/${encodeURIComponent(h.locId)}`} target="_blank" rel="noreferrer">
                  {h.locName}
                </a>
              </td>
              {hasAreas && <td>{areaLabel(h.area)}</td>}
              <td>{h.numSpeciesAllTime ?? '—'}</td>
              <td>{h.latestObsDt ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <EbirdCredit />
    </details>
  );
}
