import * as XLSX from 'xlsx';
import type { AssignmentRow } from '../../db/pgliteDb';
import { isoDay } from '../../services/countDay';
import { csvSafeRows, writeParticipantsSheet, type SheetFormat } from './workbook';

interface Props {
  circleCode: string;
  assignments: AssignmentRow[];
  onExported: (status: string) => void;
}

export function RosterExportCard({ circleCode, assignments, onExported }: Props) {
  function exportRoster(format: SheetFormat) {
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
    const dateStamp = isoDay(new Date());
    const baseName = `${circleCode.toLowerCase()}-participants-${dateStamp}`;
    const sheetRows = format === 'csv' ? csvSafeRows(exportRows) : exportRows;
    writeParticipantsSheet(XLSX.utils.json_to_sheet(sheetRows), baseName, format);
    onExported(`Exported ${exportRows.length} participants to ${baseName}.${format}`);
  }

  return (
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
  );
}
