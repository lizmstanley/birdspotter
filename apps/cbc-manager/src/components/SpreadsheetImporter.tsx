import { useRef, useState, type ChangeEvent } from 'react';
import { describeError } from '../services/describeError';
import type { AreaOption, AssignmentRow, ImportedParticipantRow, ImportOptions } from '../db/pgliteDb';
import { ImportHelp } from './import/ImportHelp';
import { ImportMapper } from './import/ImportMapper';
import { RosterExportCard } from './import/RosterExportCard';
import { useRosterImportForm } from './import/useRosterImportForm';
import { readFirstSheet } from './import/workbook';

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

export function SpreadsheetImporter({ circleCode, assignments, areas, onImport, onClearRoster }: Props) {
  const form = useRosterImportForm(areas);
  const [status, setStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const latestFileRef = useRef(0);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const request = ++latestFileRef.current;
    setStatus(null);
    form.startFile(file.name);
    try {
      const parsed = await readFirstSheet(file);
      if (request !== latestFileRef.current) return;
      if (parsed === null) {
        setStatus(`${file.name} has no sheets.`);
        return;
      }
      form.loadRows(parsed);
    } catch (err) {
      if (request === latestFileRef.current) setStatus(`Could not read ${file.name}: ${describeError(err)}`);
    } finally {
      input.value = '';
    }
  }

  async function runImport() {
    const problem = form.blockingProblem();
    if (problem) {
      setStatus(problem);
      return;
    }
    setIsBusy(true);
    setStatus(null);
    try {
      const res = await onImport(circleCode, form.mappedRows, form.importOptions());
      setStatus(`Imported ${res.imported} participant rows into your local browser database.`);
    } catch (err) {
      setStatus(`Import error: ${describeError(err)}`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="stack">
      <RosterExportCard circleCode={circleCode} assignments={assignments} onExported={setStatus} />

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

        <ImportHelp />

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          title="Choose a spreadsheet. Nothing is saved until you click Import."
          onChange={handleFileChange}
        />

        {form.headers.length > 0 && <ImportMapper form={form} isBusy={isBusy} onImport={runImport} />}

        {status && <p className="status-banner">{status}</p>}
      </div>
    </div>
  );
}
