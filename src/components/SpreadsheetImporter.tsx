import { useMemo, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { isAudubonExport, mapAudubonRows } from '../services/audubonImport';
import { describeError } from '../services/describeError';
import {
  COUNTER_OPTIONS,
  RSVP_OPTIONS,
  SAMPLE_HEADERS,
  SAMPLE_ROWS,
  buildRows,
  checkRows,
  distinctValues,
  normalizeCounterType,
  normalizeRsvp,
  type ColumnMapping,
  type ValueMap,
} from '../services/importPreview';
import type { AreaOption, AssignmentRow, ImportedParticipantRow, ImportOptions } from '../db/pgliteDb';

interface Props {
  circleCode: string;
  assignments: AssignmentRow[];
  areas: AreaOption[];
  onImport: (
    circleCode: string,
    rows: ImportedParticipantRow[],
    options: ImportOptions
  ) => Promise<{ imported: number }>;
  onClearRoster?: () => Promise<void>;
}

const EMPTY_MAPPING: ColumnMapping = {
  nameCol: '',
  emailCol: '',
  areaCol: '',
  rsvpCol: '',
  typeCol: '',
  noteCol: '',
};

const PREVIEW_ROWS = 10;

function guessColumn(headers: string[], patterns: RegExp[]): string {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(h));
    if (found) return found;
  }
  return '';
}

export function SpreadsheetImporter({ circleCode, assignments, areas, onImport, onClearRoster }: Props) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [rsvpValues, setRsvpValues] = useState<ValueMap>({});
  const [typeValues, setTypeValues] = useState<ValueMap>({});
  const [isAudubon, setIsAudubon] = useState(false);
  const [defaultRsvp, setDefaultRsvp] = useState('');
  const [isCurrentList, setIsCurrentList] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    setFileName(file.name);
    setHeaders([]);
    setRawRows([]);

    let parsed: Record<string, unknown>[];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = wb.SheetNames.at(0);
      if (firstSheetName === undefined) {
        setStatus(`${file.name} has no sheets.`);
        return;
      }
      parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheetName], { defval: '' });
    } catch (err) {
      setStatus(`Could not read ${file.name}: ${describeError(err)}`);
      return;
    }

    const cols = parsed.length > 0 ? Object.keys(parsed[0]) : [];
    setHeaders(cols);
    setIsAudubon(isAudubonExport(cols));
    setRawRows(parsed);
    setRsvpValues({});
    setTypeValues({});
    setDefaultRsvp('');
    setIsCurrentList(false);
    setMapping({
      nameCol: guessColumn(cols, [/name/i, /participant/i, /birder/i, /nickname/i]),
      emailCol: guessColumn(cols, [/email/i, /e-mail/i]),
      areaCol: guessColumn(cols, [/area/i, /sector/i, /territory/i, /zone/i]),
      rsvpCol: guessColumn(cols, [/rsvp/i, /participat/i, /status/i]),
      typeCol: guessColumn(cols, [/feeder/i, /type/i, /method/i]),
      noteCol: guessColumn(cols, [/note/i, /comment/i, /anything else/i]),
    });
  }

  const mappedRows = useMemo(
    () => (isAudubon ? mapAudubonRows(rawRows) : buildRows(rawRows, mapping, rsvpValues, typeValues)),
    [isAudubon, rawRows, mapping, rsvpValues, typeValues]
  );
  const check = useMemo(
    () =>
      checkRows(
        mappedRows,
        areas.map((a) => a.code)
      ),
    [mappedRows, areas]
  );
  const rsvpDistinct = useMemo(
    () => (isAudubon ? [] : distinctValues(rawRows, mapping.rsvpCol)),
    [isAudubon, rawRows, mapping.rsvpCol]
  );
  const typeDistinct = useMemo(
    () => (isAudubon ? [] : distinctValues(rawRows, mapping.typeCol)),
    [isAudubon, rawRows, mapping.typeCol]
  );

  const needsDefaultRsvp = !isAudubon && !mapping.rsvpCol;

  function chooseMapping(key: keyof ColumnMapping, value: string) {
    setMapping((m) => ({ ...m, [key]: value }));
    if (key === 'rsvpCol') setRsvpValues({});
    if (key === 'typeCol') setTypeValues({});
  }

  async function runImport() {
    if (!isAudubon && !mapping.emailCol) {
      setStatus('Please select an Email column first.');
      return;
    }
    if (needsDefaultRsvp && !defaultRsvp) {
      setStatus('Choose an RSVP for people new to this season first.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      // An Audubon list adds people and marks who is on it. It never changes what the compiler recorded.
      const options: ImportOptions = isAudubon
        ? { defaultRsvp: 'no_response', updateExisting: false, isCurrentList: false }
        : { defaultRsvp: defaultRsvp || undefined, updateExisting: true, isCurrentList };
      const res = await onImport(circleCode, mappedRows, options);
      setStatus(`Imported ${res.imported} participant rows into your local browser database.`);
    } catch (err) {
      setStatus(`Import error: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function downloadSample(format: 'xlsx' | 'csv') {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: SAMPLE_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    if (format === 'xlsx') {
      XLSX.writeFile(wb, 'cbc-participants-sample.xlsx');
    } else {
      XLSX.writeFile(wb, 'cbc-participants-sample.csv', { bookType: 'csv' });
    }
  }

  function renderValueMap(
    title: string,
    distinct: { value: string; count: number }[],
    values: ValueMap,
    setValues: (v: ValueMap) => void,
    options: { value: string; label: string }[],
    normalize: (raw: string) => string
  ) {
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

  function labelFor(options: { value: string; label: string }[], value?: string): string {
    return options.find((o) => o.value === value)?.label ?? value ?? '';
  }

  function exportRoster(format: 'xlsx' | 'csv') {
    const exportRows = assignments.map((row) => ({
      Circle: circleCode,
      Area: row.area ?? 'Unassigned',
      Cities: row.cities ?? '',
      Full_Name: row.full_name,
      Email: row.email ?? '',
      Counter_Type: row.counter_type ?? '',
      RSVP_Status: row.rsvp_status,
      Area_Leader: row.is_area_leader ? 'Yes' : 'No',
      Companions: row.companions ?? '',
      Notes: row.active_notes ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const baseName = `${circleCode.toLowerCase()}-participants-${dateStamp}`;

    if (format === 'xlsx') {
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      XLSX.writeFile(wb, `${baseName}.csv`, { bookType: 'csv' });
    }
    setStatus(`Exported ${exportRows.length} participants to ${baseName}.${format}`);
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Export Participant Roster — {circleCode}</h2>
            <p className="muted">
              Download your current circle&apos;s participant list, area assignments, emails, and notes as Excel (.xlsx) or CSV (.csv).
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={assignments.length === 0}
              title="Download this season's confirmed and undecided counters as a spreadsheet. This isn't a backup: use Export Backup to save everything."
              onClick={() => exportRoster('xlsx')}
            >
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              disabled={assignments.length === 0}
              title="Download this season's confirmed and undecided counters as a CSV file. This isn't a backup: use Export Backup to save everything."
              onClick={() => exportRoster('csv')}
            >
              Export CSV (.csv)
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Import Participant Roster (.xlsx or .csv) — {circleCode}</h2>
          {onClearRoster && (
            <button
              type="button"
              title="Permanently delete every person, email, season record, and note in this circle. Areas and map outlines stay. You confirm first."
              onClick={() => void onClearRoster()}
            >
              Clear Current Roster (Start Fresh)
            </button>
          )}
        </div>
        <p className="muted">
          Upload a participant spreadsheet (Google Form responses, Audubon list, or Excel roster).
          Files are parsed entirely in your browser and saved to local IndexedDB (PGlite).
        </p>

        <details className="import-help">
          <summary>What columns can I use? Download a sample</summary>
          <ul>
            <li><strong>Email</strong> (required): rows without an email are skipped. The same email in a later row updates the same person.</li>
            <li><strong>Name</strong>: if blank, the part of the email before the @ is used.</li>
            <li><strong>Area</strong>: an area code such as A1. New codes are added to the circle.</li>
            <li><strong>RSVP</strong>: for example Yes, Maybe, No. You can choose what each value in your file means before you import. With no RSVP column, you choose the RSVP for people new to this season.</li>
            <li><strong>Counter Type</strong>: Field, Feeder, or Both. Blank means Field.</li>
            <li><strong>Notes</strong>: saved as a note on the person.</li>
          </ul>
          <p>
            A column you skip, or a blank Area, keeps what is already saved for this season.
          </p>
          <p>
            A participant list exported from your circle page on the Audubon site is recognized and needs no setup. It adds
            new people and marks who is on the Audubon list. It never changes the RSVP, type, or area you already have for
            someone. The sample file uses made-up names and emails.
          </p>
          <div className="row-actions">
            <button type="button" onClick={() => downloadSample('csv')}>Sample (.csv)</button>
            <button type="button" onClick={() => downloadSample('xlsx')}>Sample (.xlsx)</button>
          </div>
        </details>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          title="Choose a spreadsheet. Nothing is saved until you click Import."
          onChange={handleFileChange}
        />

        {headers.length > 0 && (
          <div className="mapper">
            <p>
              Loaded <strong>{rawRows.length}</strong> rows from <code>{fileName}</code>.{' '}
              {isAudubon
                ? 'This is an Audubon participant list. Names, emails, sectors, and notes are read automatically. New people marked Registered are confirmed; other new people have no response yet. People already on this season’s list keep their RSVP, type, and area.'
                : 'Map your columns below:'}
            </p>
            <div className="mapper-grid" hidden={isAudubon}>
              {(
                [
                  ['emailCol', 'Email (required)'],
                  ['nameCol', 'Full Name'],
                  ['areaCol', 'Area / Sector Code'],
                  ['rsvpCol', 'RSVP Status'],
                  ['typeCol', 'Field / Feeder Type'],
                  ['noteCol', 'Notes / Comments'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <select value={mapping[key]} onChange={(e) => chooseMapping(key, e.target.value)}>
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

            {!isAudubon && (
              <div className="value-map">
                <label>
                  <input
                    type="checkbox"
                    checked={isCurrentList}
                    onChange={(e) => setIsCurrentList(e.target.checked)}
                  />{' '}
                  This file is my current list
                </label>
                <p className="muted">
                  For example your mailing list or Google Group members. Everyone in this file is marked as on your
                  current list, and everyone else in this circle is taken off it. Possible Outreach compares the
                  Audubon list with it.
                </p>
              </div>
            )}

            {needsDefaultRsvp && (
              <div className="value-map">
                <h3>No RSVP column</h3>
                <p className="muted">
                  Choose the RSVP for people new to this season. People already on this season&apos;s list keep their RSVP.
                </p>
                <select
                  aria-label="RSVP for new people"
                  value={defaultRsvp}
                  onChange={(e) => setDefaultRsvp(e.target.value)}
                >
                  <option value="">-- Choose --</option>
                  {RSVP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {renderValueMap('RSVP values', rsvpDistinct, rsvpValues, setRsvpValues, RSVP_OPTIONS, normalizeRsvp)}
            {renderValueMap(
              'Counter type values',
              typeDistinct,
              typeValues,
              setTypeValues,
              COUNTER_OPTIONS,
              normalizeCounterType
            )}

            <div className="import-preview">
              <h3>Preview</h3>
              <ul className="import-checks">
                <li>
                  <strong>{check.willImport}</strong> of {check.total} rows will be imported.
                </li>
                {check.skippedNoEmail > 0 && (
                  <li className="warn">
                    {check.skippedNoEmail} rows have no valid email and will be skipped.
                    {!isAudubon && !mapping.emailCol ? ' Choose the Email column above.' : ''}
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
                    {mappedRows.slice(0, PREVIEW_ROWS).map((r, i) => (
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
              {mappedRows.length > PREVIEW_ROWS && (
                <p className="muted">Showing the first {PREVIEW_ROWS} of {mappedRows.length} rows.</p>
              )}
            </div>

            <button
              className="btn-primary"
              onClick={runImport}
              disabled={busy || check.willImport === 0 || (needsDefaultRsvp && !defaultRsvp)}
            >
              {busy ? 'Importing...' : `Import ${check.willImport} Participants into Local Postgres`}
            </button>
          </div>
        )}

        {status && <p className="status-banner">{status}</p>}
      </div>
    </div>
  );
}
