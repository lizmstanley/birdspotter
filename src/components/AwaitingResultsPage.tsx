import type { AreaOption, AssignmentRow } from '../db/pgliteDb';
import { areaDisplayName } from './map/mapText';

interface Props {
  circleCode: string;
  countDate: string | null;
  /** False before count day: no area is waiting on results yet */
  resultsDue: boolean;
  countedAreas: AreaOption[];
  assignments: AssignmentRow[];
  onToggleResultsReceived: (areaCode: string, received: boolean) => Promise<void>;
  onSelectArea: (areaCode: string) => void;
  onCopyBcc: (emails: string[], label: string) => void;
}

export function AwaitingResultsPage({
  circleCode,
  countDate,
  resultsDue,
  countedAreas,
  assignments,
  onToggleResultsReceived,
  onSelectArea,
  onCopyBcc,
}: Props) {
  if (!resultsDue) {
    return (
      <div className="card">
        <h2>{circleCode} &mdash; Results</h2>
        <p className="muted">
          Results tracking starts on {countDate ? `count day, ${countDate}` : 'Dec 14, when the count window opens'}. Until then no area is waiting on
          results. {countedAreas.length} counted areas will be tracked.
        </p>
      </div>
    );
  }

  const awaiting = countedAreas.filter((a) => !a.results_received);
  const received = countedAreas.filter((a) => a.results_received);

  function getAreaContacts(areaCode: string) {
    const people = assignments.filter(
      (r) => (r.area ?? '').toUpperCase() === areaCode.toUpperCase()
    );
    const sorted = [...people].sort((a, b) => Number(b.is_area_leader) - Number(a.is_area_leader));
    const emails = sorted.map((p) => p.email).filter((e): e is string => Boolean(e));
    return { people: sorted, emails };
  }

  const allFollowUpEmails = Array.from(
    new Set(awaiting.flatMap((a) => getAreaContacts(a.code).emails))
  );

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>
              {circleCode} &mdash; Areas Awaiting Results ({awaiting.length} of {countedAreas.length})
            </h2>
            <p className="muted">
              Check off each area as its count results come in. Use Copy BCC to follow up with leaders and counters.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={allFollowUpEmails.length === 0}
            title="Copy the emails of everyone assigned to an area that hasn't sent results, for the BCC line of one email"
            onClick={() => onCopyBcc(allFollowUpEmails, 'awaiting-results follow-up')}
          >
            Copy All Follow-Up BCC ({allFollowUpEmails.length})
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Area</th>
              <th>Who to Follow Up With</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {awaiting.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  All counted areas for {circleCode} have results marked as received!
                </td>
              </tr>
            ) : (
              awaiting.map((area) => {
                const { people, emails } = getAreaContacts(area.code);
                const label = areaDisplayName(area.code);
                return (
                  <tr key={area.code}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Mark ${label} results received`}
                        checked={false}
                        onChange={() => void onToggleResultsReceived(area.code, true)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => onSelectArea(area.code)}
                      >
                        <strong>{label}</strong>
                      </button>
                      {area.cities && <div className="muted">{area.cities}</div>}
                    </td>
                    <td>
                      {people.length === 0 ? (
                        <span className="muted">No counters assigned</span>
                      ) : (
                        people.map((p) => (
                          <div key={p.participation_id}>
                            <strong>{p.full_name}</strong>
                            {p.is_area_leader && <span className="badge">Leader</span>}
                            {p.email && <span className="muted"> ({p.email})</span>}
                          </div>
                        ))
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-subtle"
                        disabled={emails.length === 0}
                        onClick={() => onCopyBcc(emails, `${label} follow-up`)}
                      >
                        Copy BCC ({emails.length})
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {received.length > 0 && (
        <div className="card">
          <h2>Results Received ({received.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Area</th>
                <th>Cities</th>
              </tr>
            </thead>
            <tbody>
              {received.map((area) => {
                const label = areaDisplayName(area.code);
                return (
                  <tr key={area.code}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Unmark ${label} results received`}
                        checked={true}
                        onChange={() => void onToggleResultsReceived(area.code, false)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => onSelectArea(area.code)}
                      >
                        <strong>{label}</strong>
                      </button>
                    </td>
                    <td>{area.cities ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
