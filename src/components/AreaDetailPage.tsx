import type { AreaOption, AssignmentRow } from '../db/pgliteDb';
import { areaDisplayName } from './map/mapText';
import { countingSince } from './PersonHistoryDialog';

interface Props {
  circleCode: string;
  areaCode: string;
  areaLabel?: string | null;
  isCounted: boolean;
  resultsReceived: boolean;
  areaInfo?: AreaOption | null;
  allAreas: AreaOption[];
  assignments: AssignmentRow[];
  backLabel: string;
  onBack: () => void;
  onOpenPerson: (personId: number) => void;
  onReassign: (participationId: number, newArea: string) => Promise<void>;
  onCopyBcc: (emails: string[], label: string) => void;
  onToggleCounted: (areaCode: string, isCounted: boolean) => Promise<void>;
  onToggleResultsReceived: (areaCode: string, received: boolean) => Promise<void>;
}

export function AreaDetailPage({
  circleCode,
  areaCode,
  areaLabel,
  isCounted,
  resultsReceived,
  areaInfo,
  allAreas,
  assignments,
  backLabel,
  onBack,
  onOpenPerson,
  onReassign,
  onCopyBcc,
  onToggleCounted,
  onToggleResultsReceived,
}: Props) {
  const areaAssignments = assignments.filter(
    (a) => (a.area ?? '').toUpperCase() === areaCode.toUpperCase()
  );
  const emails = areaAssignments.map((a) => a.email).filter((e): e is string => Boolean(e));
  const title = areaDisplayName(areaCode);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <div>
            <button type="button" onClick={onBack} style={{ marginBottom: 10 }}>
              &larr; Back to {backLabel}
            </button>
            <h2>
              {circleCode} &mdash; {title}
              {areaInfo?.cities ? ` (${areaInfo.cities})` : ''}
            </h2>
            {areaLabel && areaLabel !== areaCode && (
              <p className="muted">KML / Sector Label: {areaLabel}</p>
            )}
          </div>
          <div className="row-actions">
            {isCounted && (
              <label
                className="results-checkbox-pill"
                title="Check this when the area's count results come in. Checked areas leave Awaiting Results."
              >
                <input
                  type="checkbox"
                  checked={resultsReceived}
                  onChange={(e) => void onToggleResultsReceived(areaCode, e.target.checked)}
                />
                <span>Results Received</span>
              </label>
            )}
            <button
              type="button"
              className="btn-subtle"
              title={
                isCounted
                  ? "Skip this area this season. It stays on the map in gray but leaves Open Areas and assignments."
                  : 'Count this area again. It shows up in Open Areas and assignments.'
              }
              onClick={() => void onToggleCounted(areaCode, !isCounted)}
            >
              {isCounted ? 'Mark as Not Counted' : 'Restore to Counted'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={emails.length === 0}
              title="Copy the emails of everyone assigned to this area, for the BCC line of one email"
              onClick={() => onCopyBcc(emails, `${title}`)}
            >
              Copy Area BCC ({emails.length})
            </button>
          </div>
        </div>

        <div className="stats-grid" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="stat-card">
            <div className="stat-label">Assigned Counters</div>
            <div className="stat-value">{areaAssignments.length}</div>
            <div className="stat-sub">
              {areaAssignments.filter((a) => a.is_area_leader).length} leader(s)
            </div>
          </div>
          <div className="stat-card stat-amber">
            <div className="stat-label">Coverage Status</div>
            <div className="stat-value">
              {areaAssignments.some(
                (a) => a.rsvp_status === 'confirmed' && (a.counter_type === 'field' || a.counter_type === 'both')
              )
                ? 'Covered'
                : 'Open'}
            </div>
            <div className="stat-sub">
              {areaInfo?.notable_spots || 'No notable spots listed'}
            </div>
          </div>
        </div>

        {areaInfo?.active_restrictions && (
          <div className="error-box" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>Active Restriction:</strong> {areaInfo.active_restrictions}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Counters Assigned to {title} ({areaAssignments.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Counter</th>
              <th>Email</th>
              <th>Type</th>
              <th>RSVP</th>
              <th>Reassign Area</th>
              <th>Active / Pinned Notes</th>
            </tr>
          </thead>
          <tbody>
            {areaAssignments.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No counters are currently assigned to {title}. You can assign counters from the
                  Assignments tab or import a roster spreadsheet.
                </td>
              </tr>
            ) : (
              areaAssignments.map((row) => (
                <tr key={row.participation_id}>
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
                      <span
                        className={`pill ${
                          row.counter_type === 'home_feeders' ? 'pill-feeder' : 'pill-field'
                        }`}
                      >
                        {row.counter_type.replace('_', ' ')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        row.rsvp_status === 'confirmed' ? 'pill-confirmed' : 'pill-undecided'
                      }`}
                    >
                      {row.rsvp_status}
                    </span>
                  </td>
                  <td>
                    <select
                      value={row.area ?? ''}
                      onChange={(e) => void onReassign(row.participation_id, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {allAreas.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} {a.cities ? `(${a.cities})` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="notes-cell">{row.active_notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
