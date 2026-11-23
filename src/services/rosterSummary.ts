import type { AssignmentRow, PossibleOutreachRow } from '../db/pgliteDb.ts';

/** @returns counters per area, keyed by the upper-cased area code */
export function countCountersByArea(assignments: readonly Pick<AssignmentRow, 'area'>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of assignments) {
    if (!row.area) continue;
    const key = row.area.toUpperCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function emailsOf(rows: readonly { email: string | null }[]): string[] {
  return rows.map((row) => row.email).filter((email): email is string => Boolean(email));
}

export function emailsNotOnList(outreach: readonly Pick<PossibleOutreachRow, 'reason' | 'email'>[]): string[] {
  return emailsOf(outreach.filter((row) => row.reason === 'not_on_list'));
}
