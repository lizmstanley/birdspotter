import type { ImportedParticipantRow } from '../db/pgliteDb';

export interface ColumnMapping {
  nameCol: string;
  emailCol: string;
  areaCol: string;
  rsvpCol: string;
  typeCol: string;
  noteCol: string;
}

/** Per column: the text found in the file -> the app value the user chose for it. */
export type ValueMap = Record<string, string>;

export const RSVP_OPTIONS: { value: string; label: string }[] = [
  { value: 'no_response', label: 'No response' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'undecided', label: 'Undecided' },
  { value: 'declined_keep', label: 'Declined, keep on list' },
  { value: 'declined_remove', label: 'Declined, remove from list' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

export const COUNTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'field', label: 'Field' },
  { value: 'home_feeders', label: 'Home feeders' },
  { value: 'both', label: 'Field and feeders' },
  { value: 'coordinator_only', label: 'Coordinator only' },
];

function matchOption(options: { value: string; label: string }[], text: string): string | undefined {
  return options.find((o) => o.value === text || o.label.toLowerCase() === text)?.value;
}

/** Reads free text loosely. Text it does not recognize is no response, never a confirmation. */
export function normalizeRsvp(raw?: string): string {
  const t = (raw ?? '').trim().toLowerCase();
  const exact = matchOption(RSVP_OPTIONS, t);
  if (exact) return exact;
  if (!t) return 'confirmed';
  if (/\b(maybe|undecided|pending|tbd)\b/.test(t)) return 'undecided';
  if (t.includes('remove')) return 'declined_remove';
  if (/\bno[- ]?show\b/.test(t)) return 'no_show';
  if (t.includes('cancel')) return 'cancelled';
  if (/^(yes|y)\b/.test(t)) return 'confirmed';
  if (/declin|\b(can|won)['’]?t\b|cannot|\bno\b|^n$/.test(t)) return 'declined_keep';
  if (/\bnot\b/.test(t)) return 'no_response';
  if (/\b(yes|confirmed)\b/.test(t)) return 'confirmed';
  return 'no_response';
}

export function normalizeCounterType(raw?: string): string {
  const t = (raw ?? '').trim().toLowerCase();
  const exact = matchOption(COUNTER_OPTIONS, t);
  if (exact) return exact;
  if (t.includes('both') || (t.includes('field') && t.includes('feeder'))) return 'both';
  if (t.includes('feeder')) return 'home_feeders';
  if (t.includes('coord')) return 'coordinator_only';
  return 'field';
}

const MAX_DISTINCT = 30;

/** The different values in one column, most common first. Blank cells are included as ''. */
export function distinctValues(
  rows: Record<string, unknown>[],
  column: string
): { value: string; count: number }[] {
  if (!column) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = String(row[column] ?? '').trim();
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, MAX_DISTINCT);
}

function cell(row: Record<string, unknown>, column: string): string {
  return column ? String(row[column] ?? '').trim() : '';
}

/**
 * Rows as the app will read them, after any value choices the user made.
 * A skipped RSVP or type column leaves that field undefined, so the import keeps the value already stored.
 */
export function buildRows(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
  rsvpValues: ValueMap,
  typeValues: ValueMap
): ImportedParticipantRow[] {
  return rawRows.map((row) => {
    const rsvpRaw = cell(row, mapping.rsvpCol);
    const typeRaw = cell(row, mapping.typeCol);
    return {
      full_name: cell(row, mapping.nameCol),
      email: cell(row, mapping.emailCol),
      area_code: cell(row, mapping.areaCol) || null,
      rsvp_status: mapping.rsvpCol ? (rsvpValues[rsvpRaw] ?? normalizeRsvp(rsvpRaw)) : undefined,
      counter_type: mapping.typeCol ? (typeValues[typeRaw] ?? normalizeCounterType(typeRaw)) : undefined,
      note: cell(row, mapping.noteCol),
    };
  });
}

export interface ImportCheck {
  total: number;
  /** Rows the import will skip: no usable email. */
  skippedNoEmail: number;
  /** Emails that appear more than once. Later rows update the same person. */
  duplicateEmails: string[];
  /** Area codes in the file that the circle does not have yet. They are created on import. */
  newAreas: string[];
  willImport: number;
}

export function checkRows(rows: ImportedParticipantRow[], knownAreaCodes: string[]): ImportCheck {
  const known = new Set(knownAreaCodes.map((c) => c.trim().toLowerCase()));
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const newAreas = new Map<string, string>();
  let skipped = 0;
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (!email.includes('@')) {
      skipped += 1;
      continue;
    }
    if (seen.has(email)) dupes.add(email);
    seen.add(email);
    const area = r.area_code?.trim();
    if (area && !known.has(area.toLowerCase())) newAreas.set(area.toLowerCase(), area);
  }
  return {
    total: rows.length,
    skippedNoEmail: skipped,
    duplicateEmails: [...dupes],
    newAreas: [...newAreas.values()],
    willImport: rows.length - skipped,
  };
}

/** A small example file that imports with no changes. All names and emails are made up. */
export const SAMPLE_HEADERS = ['Name', 'Email', 'Area', 'RSVP', 'Counter Type', 'Notes'];

export const SAMPLE_ROWS: Record<string, string>[] = [
  { Name: 'Alex Example', Email: 'alex@example.com', Area: 'A1', RSVP: 'Yes', 'Counter Type': 'Field', Notes: 'Area leader' },
  { Name: 'Sam Sample', Email: 'sam@example.com', Area: 'B2', RSVP: 'Maybe', 'Counter Type': 'Feeder', Notes: '' },
  { Name: 'Jordan Placeholder', Email: 'jordan@example.com', Area: '', RSVP: 'No', 'Counter Type': 'Field', Notes: 'Prefers mornings' },
];
