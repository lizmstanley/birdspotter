import { useState } from 'react';
import type { AreaOption, AreaPartyTotals, Party } from '../db/pgliteDb';
import { isoDay } from '../services/countDay';
import { clockTime } from '../services/partyForm';
import { PartyForm } from './PartyForm';

interface Props {
  areaTitle: string;
  areaCode: string;
  /** This area's parties for the current season, by start time */
  parties: Party[];
  totals: AreaPartyTotals | null;
  defaultDate: string;
  allAreas: AreaOption[];
  onSaveParty: (party: Party) => Promise<boolean>;
  onRemoveParty: (party: Party) => void;
}

/** Which party the form is open for: a new one, or the ID of one to edit. */
type Editing = { kind: 'new' } | { kind: 'edit'; partyId: string } | null;

function amount(value: number): string {
  return value.toFixed(2);
}

export function AreaPartiesCard({
  areaTitle,
  areaCode,
  parties,
  totals,
  defaultDate,
  allAreas,
  onSaveParty,
  onRemoveParty,
}: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const editedParty = editing?.kind === 'edit' ? (parties.find((p) => p.party_id === editing.partyId) ?? null) : null;

  async function save(party: Party) {
    if (await onSaveParty(party)) setEditing(null);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          Parties in {areaTitle} ({parties.length})
        </h2>
        <button type="button" onClick={() => setEditing({ kind: 'new' })} disabled={editing !== null}>
          Add Party
        </button>
      </div>
      <p className="muted">
        One line per party for this season, for the count sheet. Adding a party does not mark the area&apos;s results
        received.
      </p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Participants</div>
          <div className="stat-value">{totals?.participants ?? 0}</div>
          <div className="stat-sub">{totals?.parties ?? 0} part{totals?.parties === 1 ? 'y' : 'ies'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Party Hours</div>
          <div className="stat-value">{amount((totals?.car_hours ?? 0) + (totals?.foot_hours ?? 0))}</div>
          <div className="stat-sub">
            {amount(totals?.car_hours ?? 0)} by car, {amount(totals?.foot_hours ?? 0)} on foot
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Party Miles</div>
          <div className="stat-value">{amount((totals?.car_miles ?? 0) + (totals?.foot_miles ?? 0))}</div>
          <div className="stat-sub">
            {amount(totals?.car_miles ?? 0)} by car, {amount(totals?.foot_miles ?? 0)} on foot
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Feeder Hours</div>
          <div className="stat-value">{amount(totals?.feeder_hours ?? 0)}</div>
        </div>
      </div>

      {editing && (editing.kind === 'new' || editedParty) && (
        <PartyForm
          key={editing.kind === 'edit' ? editing.partyId : 'new'}
          party={editedParty}
          areaCode={areaCode}
          defaultDate={defaultDate}
          allAreas={allAreas}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Start</th>
              <th>Stop</th>
              <th>Participants</th>
              <th>Hours by Car</th>
              <th>Hours on Foot</th>
              <th>Feeder Hours</th>
              <th>Miles by Car</th>
              <th>Miles on Foot</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted">
                  No parties yet. Add one for each party that reports, by phone or on paper.
                </td>
              </tr>
            ) : (
              parties.map((p) => (
                <tr key={p.party_id}>
                  <td>{isoDay(new Date(p.start_time))}</td>
                  <td>{clockTime(p.start_time)}</td>
                  <td>{clockTime(p.stop_time)}</td>
                  <td>{p.participants}</td>
                  <td>{amount(p.car_hours)}</td>
                  <td>{amount(p.foot_hours)}</td>
                  <td>{amount(p.feeder_hours)}</td>
                  <td>{amount(p.car_miles)}</td>
                  <td>{amount(p.foot_miles)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-subtle"
                        disabled={editing !== null}
                        onClick={() => setEditing({ kind: 'edit', partyId: p.party_id })}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn-danger-ghost" onClick={() => onRemoveParty(p)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
