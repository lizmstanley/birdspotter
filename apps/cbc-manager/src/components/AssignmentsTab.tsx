import type { AreaOption, AssignmentRow } from '../db/pgliteDb';
import { countingSince } from './PersonHistoryDialog';

interface Props {
  circleCode: string;
  assignments: readonly AssignmentRow[];
  countedAreas: readonly AreaOption[];
  onReassign: (participationId: number, newArea: string) => void;
  onOpenPerson: (personId: number) => void;
}

export function AssignmentsTab({ circleCode, assignments, countedAreas, onReassign, onOpenPerson }: Props) {
  return (
    <div className="card">
      <h2>{circleCode} — Current Season Assignments</h2>
      <table>
        <thead>
          <tr>
            <th>Area</th>
            <th>Counter</th>
            <th>Email</th>
            <th>Type</th>
            <th>RSVP</th>
            <th>Active / Pinned Notes</th>
          </tr>
        </thead>
        <tbody>
          {assignments.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                No assignments yet for {circleCode}. Import a spreadsheet or add participants.
              </td>
            </tr>
          ) : (
            assignments.map((row) => (
              <tr key={row.participation_id}>
                <td>
                  <select
                    value={row.area ?? ''}
                    onChange={(e) => onReassign(row.participation_id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {countedAreas.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} {a.cities ? `(${a.cities})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => onOpenPerson(row.person_id)}>
                    <strong>{row.full_name}</strong>
                  </button>
                  {row.is_area_leader && <span className="badge">Leader</span>}
                  <span className="muted person-since">
                    {countingSince(row.first_year_participated, row.seasons_counted)}
                  </span>
                </td>
                <td>{row.email ?? '—'}</td>
                <td>
                  {row.counter_type ? (
                    <span className={`pill ${row.counter_type === 'home_feeders' ? 'pill-feeder' : 'pill-field'}`}>
                      {row.counter_type.replace('_', ' ')}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={`pill ${row.rsvp_status === 'confirmed' ? 'pill-confirmed' : 'pill-undecided'}`}>
                    {row.rsvp_status}
                  </span>
                </td>
                <td className="notes-cell">{row.active_notes || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
