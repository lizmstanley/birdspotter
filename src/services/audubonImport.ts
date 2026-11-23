import type { ImportedParticipantRow } from '../db/pgliteDb';

// The participant list a compiler exports from their circle page on cbc.audubon.org.
const REQUIRED_HEADERS = ['First Name', 'Last Name', 'Email', 'Sector', 'Registered', 'CBC Circle'];

export function isAudubonExport(headers: string[]): boolean {
  const have = new Set(headers.map((h) => h.trim()));
  return REQUIRED_HEADERS.every((h) => have.has(h));
}

function text(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? '').trim();
}

export function mapAudubonRows(rows: Record<string, unknown>[]): ImportedParticipantRow[] {
  return rows.map((row) => ({
    full_name: [text(row, 'First Name'), text(row, 'Last Name')].filter(Boolean).join(' '),
    email: text(row, 'Email'),
    area_code: text(row, 'Sector') || null,
    // "Registered" is the compiler's own mark on the Audubon page. Signing up is not a confirmation.
    rsvp_status: text(row, 'Registered').toLowerCase() === 'yes' ? 'confirmed' : 'no_response',
    counter_type: text(row, 'Count Type') || text(row, 'How do you plan to participate?'),
    note: text(row, 'Notes'),
    in_audubon_list: true,
  }));
}
