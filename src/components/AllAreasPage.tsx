import type { AreaOption, AssignmentRow } from '../db/pgliteDb';
import { areaDisplayName } from './map/mapText';

interface Props {
  circleCode: string;
  /** False before count day: no area is waiting on results yet */
  areResultsDue: boolean;
  areas: AreaOption[];
  assignments: AssignmentRow[];
  onSelectArea: (areaCode: string) => void;
}

export function AllAreasPage({ circleCode, areResultsDue, areas, assignments, onSelectArea }: Props) {
  function countersIn(areaCode: string): AssignmentRow[] {
    return assignments.filter((r) => (r.area ?? '').toUpperCase() === areaCode.toUpperCase());
  }

  return (
    <div className="card">
      <h2>
        {circleCode} &mdash; All Areas ({areas.length})
      </h2>
      <p className="muted">
        Every area in this circle. Click an area to see its counters and notes.
      </p>
      <table>
        <thead>
          <tr>
            <th>Area</th>
            <th>Cities</th>
            <th>Counted</th>
            <th>Counters This Season</th>
            <th>Results</th>
          </tr>
        </thead>
        <tbody>
          {areas.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                No areas yet for {circleCode}. Import a KML / KMZ file on the map or a roster spreadsheet.
              </td>
            </tr>
          ) : (
            areas.map((area) => {
              const label = areaDisplayName(area.code);
              const counters = countersIn(area.code);
              const leaders = counters.filter((c) => c.is_area_leader).map((c) => c.full_name);
              return (
                <tr key={area.code}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onSelectArea(area.code)}>
                      <strong>{label}</strong>
                    </button>
                  </td>
                  <td>{area.cities ?? '—'}</td>
                  <td>{area.is_counted ? 'Yes' : <span className="muted">Not counted</span>}</td>
                  <td>
                    {counters.length}
                    {leaders.length > 0 && <span className="muted"> &middot; Leader: {leaders.join(', ')}</span>}
                  </td>
                  <td>
                    {!area.is_counted ? (
                      <span className="muted">—</span>
                    ) : area.results_received ? (
                      'Received'
                    ) : areResultsDue ? (
                      <span className="muted">Awaiting</span>
                    ) : (
                      <span className="muted">After count day</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
