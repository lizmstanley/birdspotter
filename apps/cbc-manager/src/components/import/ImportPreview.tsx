import type { ImportedParticipantRow } from '../../db/pgliteDb';
import {
  COUNTER_OPTIONS,
  RSVP_OPTIONS,
  type ImportCheck,
  normalizeCounterType,
  normalizeRsvp,
} from '../../services/importPreview';

const PREVIEW_ROWS = 10;

function labelFor(options: { value: string; label: string }[], value?: string): string {
  return options.find((o) => o.value === value)?.label ?? value ?? '';
}

interface Props {
  rows: ImportedParticipantRow[];
  check: ImportCheck;
  defaultRsvp: string;
  isEmailColumnMissing: boolean;
}

export function ImportPreview({ rows, check, defaultRsvp, isEmailColumnMissing }: Props) {
  return (
    <div className="import-preview">
      <h3>Preview</h3>
      <ul className="import-checks">
        <li>
          <strong>{check.willImport}</strong> of {check.total} rows will be imported.
        </li>
        {check.skippedNoEmail > 0 && (
          <li className="warn">
            {check.skippedNoEmail} rows have no valid email and will be skipped.
            {isEmailColumnMissing ? ' Choose the Email column above.' : ''}
          </li>
        )}
        {check.duplicateEmails.length > 0 && (
          <li className="warn">
            {check.duplicateEmails.length} emails appear more than once, for example{' '}
            {check.duplicateEmails.slice(0, 3).join(', ')}. Later rows update the same person.
          </li>
        )}
        {check.newAreas.length > 0 && (
          <li className="warn">
            {check.newAreas.length} area codes are not in this circle and will be added:{' '}
            {check.newAreas.slice(0, 12).join(', ')}
            {check.newAreas.length > 12 ? ', ...' : ''}. Check for typos.
          </li>
        )}
      </ul>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Area</th>
              <th>RSVP</th>
              <th>Type</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
              <tr key={i}>
                <td>{r.full_name || <em>from email</em>}</td>
                <td>{r.email || <em>missing</em>}</td>
                <td>{r.area_code ?? ''}</td>
                <td>
                  {r.rsvp_status
                    ? labelFor(RSVP_OPTIONS, normalizeRsvp(r.rsvp_status))
                    : labelFor(RSVP_OPTIONS, defaultRsvp) || <em>choose above</em>}
                </td>
                <td>{labelFor(COUNTER_OPTIONS, normalizeCounterType(r.counter_type))}</td>
                <td>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW_ROWS && (
        <p className="muted">Showing the first {PREVIEW_ROWS} of {rows.length} rows.</p>
      )}
    </div>
  );
}
