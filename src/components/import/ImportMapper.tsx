import {
  COUNTER_OPTIONS,
  RSVP_OPTIONS,
  normalizeCounterType,
  normalizeRsvp,
  type ColumnMapping,
  type ValueMap,
} from '../../services/importPreview';
import { ImportPreview } from './ImportPreview';
import type { RosterImportForm } from './useRosterImportForm';

const COLUMN_FIELDS = [
  ['emailCol', 'Email (required)'],
  ['nameCol', 'Full Name'],
  ['areaCol', 'Area / Sector Code'],
  ['rsvpCol', 'RSVP Status'],
  ['typeCol', 'Field / Feeder Type'],
  ['noteCol', 'Notes / Comments'],
] as const;

interface Props {
  form: RosterImportForm;
  isBusy: boolean;
  onImport: () => void;
}

export function ImportMapper({ form, isBusy, onImport }: Props) {
  const { check, isAudubon, needsDefaultRsvp, defaultRsvp } = form;
  return (
    <div className="mapper">
      <p>
        Loaded <strong>{form.rawRows.length}</strong> rows from <code>{form.fileName}</code>.{' '}
        {isAudubon
          ? 'This is an Audubon participant list. Names, emails, sectors, and notes are read automatically. New people marked Registered are confirmed; other new people have no response yet. People already on this season’s list keep their RSVP, type, and area.'
          : 'Map your columns below:'}
      </p>
      <ColumnSelects
        headers={form.headers}
        mapping={form.mapping}
        isHidden={isAudubon}
        onChoose={form.chooseMapping}
      />

      {!isAudubon && <CurrentListOption isChecked={form.isCurrentList} onChange={form.setIsCurrentList} />}
      {needsDefaultRsvp && <DefaultRsvpPicker value={defaultRsvp} onChange={form.setDefaultRsvp} />}

      <ValueMapTable
        title="RSVP values"
        distinct={form.rsvpDistinct}
        values={form.rsvpValues}
        setValues={form.setRsvpValues}
        options={RSVP_OPTIONS}
        normalize={normalizeRsvp}
      />
      <ValueMapTable
        title="Counter type values"
        distinct={form.typeDistinct}
        values={form.typeValues}
        setValues={form.setTypeValues}
        options={COUNTER_OPTIONS}
        normalize={normalizeCounterType}
      />

      <ImportPreview
        rows={form.mappedRows}
        check={check}
        defaultRsvp={defaultRsvp}
        isEmailColumnMissing={!isAudubon && !form.mapping.emailCol}
      />

      <button
        className="btn-primary"
        onClick={onImport}
        disabled={isBusy || check.willImport === 0 || (needsDefaultRsvp && !defaultRsvp)}
      >
        {isBusy ? 'Importing...' : `Import ${check.willImport} Participants into Local Postgres`}
      </button>
    </div>
  );
}

interface ColumnSelectsProps {
  headers: string[];
  mapping: ColumnMapping;
  isHidden: boolean;
  onChoose: (key: keyof ColumnMapping, value: string) => void;
}

function ColumnSelects({ headers, mapping, isHidden, onChoose }: ColumnSelectsProps) {
  return (
    <div className="mapper-grid" hidden={isHidden}>
      {COLUMN_FIELDS.map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <select value={mapping[key]} onChange={(e) => onChoose(key, e.target.value)}>
            <option value="">-- Skip --</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function CurrentListOption({ isChecked, onChange }: { isChecked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="value-map">
      <label>
        <input type="checkbox" checked={isChecked} onChange={(e) => onChange(e.target.checked)} />{' '}
        This file is my current list
      </label>
      <p className="muted">
        For example your mailing list or Google Group members. Everyone in this file is marked as on your
        current list, and everyone else in this circle is taken off it. Possible Outreach compares the
        Audubon list with it.
      </p>
    </div>
  );
}

function DefaultRsvpPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="value-map">
      <h3>No RSVP column</h3>
      <p className="muted">
        Choose the RSVP for people new to this season. People already on this season&apos;s list keep their RSVP.
      </p>
      <select aria-label="RSVP for new people" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- Choose --</option>
        {RSVP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ValueMapTableProps {
  title: string;
  distinct: { value: string; count: number }[];
  values: ValueMap;
  setValues: (v: ValueMap) => void;
  options: { value: string; label: string }[];
  normalize: (raw: string) => string;
}

function ValueMapTable({ title, distinct, values, setValues, options, normalize }: ValueMapTableProps) {
  if (distinct.length === 0) return null;
  return (
    <div className="value-map">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>In your file</th>
            <th>Rows</th>
            <th>Import as</th>
          </tr>
        </thead>
        <tbody>
          {distinct.map(({ value, count }) => (
            <tr key={value || '(blank)'}>
              <td>{value || <em>(blank)</em>}</td>
              <td>{count}</td>
              <td>
                <select
                  value={values[value] ?? normalize(value)}
                  onChange={(e) => setValues({ ...values, [value]: e.target.value })}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
