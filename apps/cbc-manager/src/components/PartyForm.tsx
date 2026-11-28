import { useState } from 'react';
import type { AreaOption, Party } from '../db/pgliteDb';
import { partyFormValues, partyFromForm, type PartyFormValues } from '../services/partyForm';

interface Props {
  /** null for a new party */
  party: Party | null;
  areaCode: string;
  /** The date a new party starts on, `YYYY-MM-DD`, or blank */
  defaultDate: string;
  allAreas: AreaOption[];
  onSave: (party: Party) => Promise<void>;
  onCancel: () => void;
}

const AMOUNT_FIELDS: ReadonlyArray<{ key: keyof PartyFormValues; label: string }> = [
  { key: 'carHours', label: 'Hours by car' },
  { key: 'footHours', label: 'Hours on foot' },
  { key: 'feederHours', label: 'Feeder hours' },
  { key: 'carMiles', label: 'Miles by car' },
  { key: 'footMiles', label: 'Miles on foot' },
];

export function PartyForm({ party, areaCode, defaultDate, allAreas, onSave, onCancel }: Props) {
  const [values, setValues] = useState<PartyFormValues>(() => partyFormValues(party, defaultDate));
  // One ID per form, so a second click on Save replaces the party instead of adding another.
  const [partyId] = useState(() => party?.party_id ?? crypto.randomUUID());
  const [partyArea, setPartyArea] = useState(party?.area_code ?? areaCode);
  const [problem, setProblem] = useState<string | null>(null);

  function setField(key: keyof PartyFormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const result = partyFromForm(values, partyId, partyArea);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    void onSave(result.party);
  }

  return (
    <div className="party-form">
      <h3>{party ? 'Edit Party' : 'Add Party'}</h3>
      <div className="party-form-fields">
        {party && (
          <label>
            Area
            <select value={partyArea} onChange={(e) => setPartyArea(e.target.value)}>
              {allAreas.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.cities ? `(${a.cities})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Date
          <input type="date" value={values.date} onChange={(e) => setField('date', e.target.value)} />
        </label>
        <label>
          Start
          <input type="time" value={values.startTime} onChange={(e) => setField('startTime', e.target.value)} />
        </label>
        <label>
          Stop
          <input type="time" value={values.stopTime} onChange={(e) => setField('stopTime', e.target.value)} />
        </label>
        <label>
          Participants
          <input
            type="number"
            min={1}
            step={1}
            value={values.participants}
            onChange={(e) => setField('participants', e.target.value)}
          />
        </label>
        {AMOUNT_FIELDS.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => setField(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      {problem && (
        <div className="error-box" role="alert">
          {problem}
        </div>
      )}
      <div className="row-actions">
        <button type="button" className="btn-primary" onClick={save}>
          Save Party
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
