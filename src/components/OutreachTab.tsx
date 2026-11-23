import type { PossibleOutreachRow, ReminderRow } from '../db/pgliteDb';
import { emailsNotOnList, emailsOf } from '../services/rosterSummary';

interface Props {
  reminders: readonly ReminderRow[];
  outreach: readonly PossibleOutreachRow[];
  onCopyBcc: (emails: string[], label: string) => void;
  onOpenPerson: (personId: number) => void;
}

export function OutreachTab({ reminders, outreach, onCopyBcc, onOpenPerson }: Props) {
  const notOnListEmails = emailsNotOnList(outreach);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>Needs a Reminder ({reminders.length})</h2>
          <button
            className="btn-primary"
            disabled={reminders.length === 0}
            title="Copy these emails, separated by commas, to paste into the BCC line of one email"
            onClick={() => onCopyBcc(emailsOf(reminders), 'reminder')}
          >
            Copy BCC List
          </button>
        </div>
        <p className="muted">
          Active people on your current list with no answer yet for this season. Until you mark a current list when you
          import, this shows every active person with no answer.
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Last Year Counted</th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((r) => (
              <tr key={r.person_id}>
                <td>{r.full_name}</td>
                <td>{r.email ?? '—'}</td>
                <td>{r.last_year_counted ?? 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Possible Outreach ({outreach.length})</h2>
          <button
            className="btn-primary"
            disabled={notOnListEmails.length === 0}
            title="Copy the emails of people on the Audubon list who aren't on your current list, for the BCC line. Old-email rows are left out."
            onClick={() => onCopyBcc(notOnListEmails, 'not-on-list')}
          >
            Copy BCC: Not on Your List ({notOnListEmails.length})
          </button>
        </div>
        <p className="muted">
          People on the Audubon list who are not on your current list, and people on your current list who also have an
          email that is not on it. Mark your current list when you import it. Only active and inactive people are
          shown.
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Why</th>
              <th>Status</th>
              <th>Last Counted</th>
              <th>Warnings</th>
            </tr>
          </thead>
          <tbody>
            {outreach.map((o) => (
              <tr key={o.person_id}>
                <td>
                  <button type="button" className="link-btn" onClick={() => onOpenPerson(o.person_id)}>
                    {o.full_name}
                  </button>
                </td>
                <td>{o.email ?? '—'}</td>
                <td>
                  {o.reason === 'not_on_list' ? 'On Audubon, not on your list' : `Old email? ${o.old_emails ?? ''}`}
                </td>
                <td>{o.roster_status}</td>
                <td>{o.last_year_counted ?? '—'}</td>
                <td>{o.warnings || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
