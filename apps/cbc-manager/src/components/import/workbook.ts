import * as XLSX from 'xlsx';
import type { ColumnMapping } from '../../services/importPreview';

export type SheetFormat = 'xlsx' | 'csv';

/** @returns the first sheet's rows, or null when the workbook has no sheets. */
export async function readFirstSheet(file: File): Promise<Record<string, unknown>[] | null> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = wb.SheetNames.at(0);
  if (firstSheetName === undefined) return null;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheetName], { defval: '' });
}

export function participantsWorkbook(sheet: XLSX.WorkSheet): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Participants');
  return wb;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Puts a leading `'` on text a spreadsheet would run as a formula when it opens the CSV. */
export function csvSafeRows(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, text]) => [key, FORMULA_START.test(text) ? `'${text}` : text]))
  );
}

export function writeParticipantsSheet(sheet: XLSX.WorkSheet, baseName: string, format: SheetFormat): void {
  const wb = participantsWorkbook(sheet);
  if (format === 'xlsx') {
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  } else {
    XLSX.writeFile(wb, `${baseName}.csv`, { bookType: 'csv' });
  }
}

function guessColumn(headers: string[], patterns: RegExp[]): string {
  for (const p of patterns) {
    const found = headers.find((h) => p.test(h));
    if (found) return found;
  }
  return '';
}

export function guessMapping(headers: string[]): ColumnMapping {
  return {
    nameCol: guessColumn(headers, [/name/i, /participant/i, /birder/i, /nickname/i]),
    emailCol: guessColumn(headers, [/email/i, /e-mail/i]),
    areaCol: guessColumn(headers, [/area/i, /sector/i, /territory/i, /zone/i]),
    rsvpCol: guessColumn(headers, [/rsvp/i, /participat/i, /status/i]),
    typeCol: guessColumn(headers, [/feeder/i, /type/i, /method/i]),
    noteCol: guessColumn(headers, [/note/i, /comment/i, /anything else/i]),
  };
}
