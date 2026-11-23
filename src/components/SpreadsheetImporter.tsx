import { useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { isAudubonExport, mapAudubonRows } from '../services/audubonImport';
import type { AssignmentRow, ImportedParticipantRow } from '../db/pgliteDb';

interface Props {
  circleCode?: string;
  assignments: AssignmentRow[];
  onImport: (rows: ImportedParticipantRow[]) => Promise<{ imported: number }>;
  onClearRoster?: () => Promise<void>;
}

interface ColumnMapping {
  nameCol: string;
  emailCol: string;
  areaCol: string;
  rsvpCol: string;
  typeCol: string;
  noteCol: string;
}

function guessColumn(headers: string[], patterns: RegExp[]): string {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(h));
    if (found) return found;
  }
  return '';
}

export function SpreadsheetImporter({ circleCode, assignments, onImport, onClearRoster }: Props) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    nameCol: '',
    emailCol: '',
    areaCol: '',
    rsvpCol: '',
    typeCol: '',
    noteCol: '',
  });
  const [isAudubon, setIsAudubon] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    setFileName(file.name);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

    const cols = parsed.length > 0 ? Object.keys(parsed[0]) : [];
    setHeaders(cols);
    setIsAudubon(isAudubonExport(cols));
    setRawRows(parsed);
    setMapping({
      nameCol: guessColumn(cols, [/name/i, /participant/i, /birder/i, /nickname/i]),
      emailCol: guessColumn(cols, [/email/i, /e-mail/i]),
      areaCol: guessColumn(cols, [/area/i, /sector/i, /territory/i, /zone/i]),
      rsvpCol: guessColumn(cols, [/rsvp/i, /participat/i, /status/i]),
      typeCol: guessColumn(cols, [/feeder/i, /type/i, /method/i]),
      noteCol: guessColumn(cols, [/note/i, /comment/i, /anything else/i]),
    });
  }

  async function runImport() {
    if (!isAudubon && !mapping.emailCol) {
      setStatus('Please select an Email column first.');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const mapped: ImportedParticipantRow[] = isAudubon
        ? mapAudubonRows(rawRows)
        : rawRows.map((row) => ({
          full_name: mapping.nameCol ? String(row[mapping.nameCol] ?? '') : '',
          email: String(row[mapping.emailCol] ?? ''),
          area_code: mapping.areaCol ? String(row[mapping.areaCol] ?? '') : null,
          rsvp_status: mapping.rsvpCol ? String(row[mapping.rsvpCol] ?? '') : 'confirmed',
          counter_type: mapping.typeCol ? String(row[mapping.typeCol] ?? '') : 'field',
          note: mapping.noteCol ? String(row[mapping.noteCol] ?? '') : '',
          }));
      const res = await onImport(mapped);
      setStatus(`Imported ${res.imported} participant rows into your local browser database.`);
    } catch (err) {
      setStatus(`Import error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function exportRoster(format: 'xlsx' | 'csv') {
    const exportRows = assignments.map((row) => ({
      Circle: circleCode ?? '',
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
    const baseName = `${(circleCode || 'cbc').toLowerCase()}-participants-${dateStamp}`;

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
            <h2>Export Participant Roster{circleCode ? ` — ${circleCode}` : ''}</h2>
            <p className="muted">
              Download your current circle&apos;s participant list, area assignments, emails, and notes as Excel (.xlsx) or CSV (.csv).
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={assignments.length === 0}
              onClick={() => exportRoster('xlsx')}
            >
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              disabled={assignments.length === 0}
              onClick={() => exportRoster('csv')}
            >
              Export CSV (.csv)
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Import Participant Roster (.xlsx or .csv){circleCode ? ` — ${circleCode}` : ''}</h2>
          {onClearRoster && (
            <button type="button" onClick={() => void onClearRoster()}>
              Clear Current Roster (Start Fresh)
            </button>
          )}
        </div>
        <p className="muted">
          Upload a participant spreadsheet (Google Form responses, Audubon list, or Excel roster).
          Files are parsed entirely in your browser and saved to local IndexedDB (PGlite).
        </p>

        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />

        {headers.length > 0 && (
          <div className="mapper">
            <p>
              Loaded <strong>{rawRows.length}</strong> rows from <code>{fileName}</code>.{' '}
              {isAudubon
                ? 'This is an Audubon participant list. Names, emails, sectors, and notes are read automatically. People marked Registered are confirmed; everyone else has no response yet.'
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
                  <select
                    value={mapping[key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  >
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

            <button className="btn-primary" onClick={runImport} disabled={busy}>
              {busy ? 'Importing...' : `Import ${rawRows.length} Participants into Local Postgres`}
            </button>
          </div>
        )}

        {status && <p className="status-banner">{status}</p>}
      </div>
    </div>
  );
}
