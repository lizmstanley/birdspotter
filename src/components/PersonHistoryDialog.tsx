import { useEffect, useState } from 'react';
import type { LocalCbcDb, PersonHistory } from '../db/pgliteDb';

interface Props {
  db: LocalCbcDb;
  personId: number | null;
  onClose: () => void;
}

const ROSTER_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive (dropped for not responding)',
  removed_requested: 'Removed at their request',
  removed_no_show: 'Removed (no-show)',
  moved_away: 'Moved away',
  deceased: 'Deceased',
  external_contact: 'External contact',
};

export function countingSince(firstYear: number | null, seasonsCounted: number): string {
  if (!firstYear) return 'No seasons on record';
  if (seasonsCounted === 0) return 'New this season';
  return `Counting since ${firstYear} · ${seasonsCounted} season${seasonsCounted === 1 ? '' : 's'}`;
}

export function PersonHistoryDialog({ db, personId, onClose }: Props) {
  const [history, setHistory] = useState<PersonHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(null);
    setError(null);
    if (personId === null) return;
    let cancelled = false;
    db.getPersonHistory(personId)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [db, personId]);

  if (personId === null) return null;

  // Same rule as seasons_counted in v_current_assignments: confirmed with an area, before this season.
  const currentYear = history?.person.current_year ?? Infinity;
  const pastCounted =
    history?.seasons.filter(
      (s) => s.rsvp_status === 'confirmed' && s.assigned_area_code && s.count_year < currentYear
    ).length ?? 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="person-history-title" onClick={onClose}>
      <div className="modal-card modal-info" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="person-history-title">{history?.person.full_name ?? 'Loading...'}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {history && (
          <>
            <div className="person-meta muted">
              <span>{countingSince(history.person.first_year_participated, pastCounted)}</span>
              <span>{ROSTER_LABELS[history.person.roster_status] ?? history.person.roster_status}</span>
              {history.person.experience_level && <span>Experience: {history.person.experience_level}</span>}
              {history.person.phone && <span>Phone: {history.person.phone}</span>}
            </div>

            <div className="person-meta">
              {history.emails.map((e) => (
                <span key={e.email}>
                  {e.email}
                  {e.is_primary && <span className="badge">Primary</span>}
                  {e.in_google_group && <span className="badge">Google Group</span>}
                  {e.in_audubon_list && <span className="badge">Audubon</span>}
                </span>
              ))}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Area</th>
                  <th>RSVP</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.seasons.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No seasons on record.
                    </td>
                  </tr>
                ) : (
                  history.seasons.map((s) => (
                    <tr key={s.count_year}>
                      <td>
                        <strong>{s.count_year}</strong>
                      </td>
                      <td>
                        {s.assigned_area_code ?? '—'}
                        {s.is_area_leader && <span className="badge">Leader</span>}
                        {s.counter_type === 'home_feeders' && <span className="muted"> · feeders</span>}
                        {s.preferred_area_codes && s.preferred_area_codes.length > 0 && (
                          <div className="muted">Prefers {s.preferred_area_codes.join(', ')}</div>
                        )}
                      </td>
                      <td>{s.rsvp_status}</td>
                      <td className="notes-cell">{s.notes.length > 0 ? s.notes.join(' | ') : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
