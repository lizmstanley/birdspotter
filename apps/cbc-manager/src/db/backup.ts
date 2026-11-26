import type { PGlite, Transaction } from '@electric-sql/pglite';
import { CBC_CIRCLE_RADIUS_MILES } from '../services/cbcCircle.ts';
import { computeSortOrder } from './areas.ts';
import { BackupFormatError } from './errors.ts';
import { deleteRosterRows } from './roster.ts';

type BackupRow = Record<string, unknown>;

const BACKUP_TABLES = [
  'saved_circles',
  'count_years',
  'areas',
  'people',
  'person_emails',
  'participations',
  'notes',
  'circle_boundaries',
  'area_results',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

function isRecord(value: unknown): value is BackupRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackup(jsonText: string): Partial<Record<BackupTable, BackupRow[]>> {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new BackupFormatError(null, err);
  }
  if (!isRecord(data)) throw new BackupFormatError(null);
  const tables: Partial<Record<BackupTable, BackupRow[]>> = {};
  for (const table of BACKUP_TABLES) {
    const rows = data[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || !rows.every(isRecord)) throw new BackupFormatError(table);
    tables[table] = rows;
  }
  return tables;
}

async function restoreAreaResults(
  tx: Transaction,
  areaResults: Array<Record<string, unknown>> | undefined,
  areas: Array<Record<string, unknown>>
): Promise<void> {
  if (areaResults) {
    for (const r of areaResults) {
      await tx.query(
        `INSERT INTO public.area_results (circle_code, count_year, area_code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [String(r.circle_code), Number(r.count_year), String(r.area_code)]
      );
    }
    return;
  }
  // Backups made before results were tracked by season carry one flag per area.
  for (const a of areas.filter((area) => area.results_received === true)) {
    await tx.query(
      `INSERT INTO public.area_results (circle_code, count_year, area_code)
       SELECT circle_code, year, $2 FROM public.count_years WHERE circle_code = $1 AND is_current
       ON CONFLICT DO NOTHING`,
      [String(a.circle_code), String(a.code)]
    );
  }
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export async function exportJsonBackup(db: PGlite): Promise<string> {
  const [circles, areas, people, emails, years, participations, notes, boundaries, areaResults] = await Promise.all([
    db.query('SELECT * FROM public.saved_circles ORDER BY name'),
    db.query('SELECT * FROM public.areas ORDER BY circle_code, sort_order, code'),
    db.query('SELECT * FROM public.people ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.person_emails ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.count_years ORDER BY circle_code, year'),
    db.query('SELECT * FROM public.participations ORDER BY circle_code, count_year, id'),
    db.query('SELECT * FROM public.notes ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.circle_boundaries ORDER BY circle_code, sort_order, area_code'),
    db.query('SELECT * FROM public.area_results ORDER BY circle_code, count_year, area_code'),
  ]);
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      saved_circles: circles.rows,
      areas: areas.rows,
      count_years: years.rows,
      people: people.rows,
      person_emails: emails.rows,
      participations: participations.rows,
      notes: notes.rows,
      circle_boundaries: boundaries.rows,
      area_results: areaResults.rows,
    },
    null,
    2
  );
}

async function restoreCircles(tx: Transaction, circles: readonly BackupRow[]): Promise<number> {
  let restored = 0;
  for (const c of circles) {
    const code = String(c.code ?? '').trim().toUpperCase();
    if (!code) continue;
    restored += 1;
    if (c.is_active) {
      await tx.query('UPDATE public.saved_circles SET is_active = FALSE WHERE is_active = TRUE');
    }
    await tx.query(
      `INSERT INTO public.saved_circles (
          code, name, state_province, center_lat, center_lng, radius_miles, is_favorite, is_active,
          compiler_name, compiler_email, count_date, audubon_url
       ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10, $11)
       ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          state_province = COALESCE(EXCLUDED.state_province, public.saved_circles.state_province),
          compiler_name = COALESCE(EXCLUDED.compiler_name, public.saved_circles.compiler_name),
          compiler_email = COALESCE(EXCLUDED.compiler_email, public.saved_circles.compiler_email),
          count_date = COALESCE(EXCLUDED.count_date, public.saved_circles.count_date),
          audubon_url = COALESCE(EXCLUDED.audubon_url, public.saved_circles.audubon_url),
          is_active = CASE WHEN $7 THEN TRUE ELSE public.saved_circles.is_active END`,
      [
        code,
        String(c.name ?? code),
        c.state_province ? String(c.state_province) : null,
        Number(c.center_lat ?? 44.83),
        Number(c.center_lng ?? -93.298),
        Number(c.radius_miles ?? CBC_CIRCLE_RADIUS_MILES),
        Boolean(c.is_active),
        c.compiler_name ? String(c.compiler_name) : null,
        c.compiler_email ? String(c.compiler_email) : null,
        c.count_date ? String(c.count_date) : null,
        c.audubon_url ? String(c.audubon_url) : null,
      ]
    );
    await deleteRosterRows(tx, code);
    await tx.query('DELETE FROM public.area_results WHERE circle_code = $1', [code]);
    await tx.query('DELETE FROM public.count_years WHERE circle_code = $1', [code]);
  }
  return restored;
}

async function restoreCountYears(tx: Transaction, years: readonly BackupRow[]): Promise<void> {
  for (const y of years) {
    await tx.query(
      `INSERT INTO public.count_years (circle_code, year, count_date, is_current, compiler_notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (circle_code, year) DO UPDATE SET
          is_current = EXCLUDED.is_current,
          count_date = COALESCE(EXCLUDED.count_date, public.count_years.count_date)`,
      [
        String(y.circle_code),
        Number(y.year),
        y.count_date ? String(y.count_date) : null,
        Boolean(y.is_current),
        y.compiler_notes ? String(y.compiler_notes) : null,
      ]
    );
  }
}

async function restoreAreas(tx: Transaction, areas: readonly BackupRow[]): Promise<void> {
  for (const a of areas) {
    await tx.query(
      `INSERT INTO public.areas (
          circle_code, code, sort_order, cities, roads, notable_spots, active_restrictions, is_counted,
          requires_special_access, is_solo_reserved, walking_friendly
       ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, COALESCE($8::BOOLEAN, TRUE),
          COALESCE($9::BOOLEAN, FALSE), COALESCE($10::BOOLEAN, FALSE), $11
       )
       ON CONFLICT (circle_code, code) DO UPDATE SET
          cities = COALESCE(EXCLUDED.cities, public.areas.cities),
          roads = COALESCE(EXCLUDED.roads, public.areas.roads),
          notable_spots = COALESCE(EXCLUDED.notable_spots, public.areas.notable_spots),
          active_restrictions = COALESCE(EXCLUDED.active_restrictions, public.areas.active_restrictions),
          is_counted = COALESCE($8::BOOLEAN, public.areas.is_counted),
          requires_special_access = COALESCE($9::BOOLEAN, public.areas.requires_special_access),
          is_solo_reserved = COALESCE($10::BOOLEAN, public.areas.is_solo_reserved),
          walking_friendly = COALESCE(EXCLUDED.walking_friendly, public.areas.walking_friendly)`,
      // A flag missing from the file (an ETL backup) keeps the value already in the app.
      [
        String(a.circle_code),
        String(a.code),
        Number(a.sort_order ?? computeSortOrder(String(a.code))),
        a.cities ? String(a.cities) : null,
        a.roads ? String(a.roads) : null,
        a.notable_spots ? String(a.notable_spots) : null,
        a.active_restrictions ? String(a.active_restrictions) : null,
        optionalBoolean(a.is_counted),
        optionalBoolean(a.requires_special_access),
        optionalBoolean(a.is_solo_reserved),
        optionalBoolean(a.walking_friendly),
      ]
    );
  }

  // Second pass: a parent area can appear after its child in the backup.
  for (const a of areas) {
    if (!a.parent_area_code) continue;
    await tx.query(
      'UPDATE public.areas SET parent_area_code = $3 WHERE circle_code = $1 AND code = $2',
      [String(a.circle_code), String(a.code), String(a.parent_area_code)]
    );
  }
}

/** @returns a map from each person's id in the backup to their new id. */
async function restorePeople(tx: Transaction, people: readonly BackupRow[]): Promise<Map<number, number>> {
  const idMap = new Map<number, number>();
  for (const p of people) {
    const res = await tx.query<{ id: number }>(
      `INSERT INTO public.people (
          circle_code, full_name, roster_status, experience_level, first_year_participated,
          prefers_hard_copy, mailing_address, phone
       ) VALUES ($1, $2, $3::public.roster_status, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        String(p.circle_code),
        String(p.full_name ?? 'Unknown'),
        String(p.roster_status ?? 'active'),
        p.experience_level ? String(p.experience_level) : null,
        p.first_year_participated ? Number(p.first_year_participated) : null,
        Boolean(p.prefers_hard_copy),
        p.mailing_address ? String(p.mailing_address) : null,
        p.phone ? String(p.phone) : null,
      ]
    );
    idMap.set(Number(p.id), res.rows[0].id);
  }
  return idMap;
}

async function restoreEmails(
  tx: Transaction,
  emails: readonly BackupRow[],
  idMap: ReadonlyMap<number, number>
): Promise<void> {
  for (const e of emails) {
    const newPersonId = idMap.get(Number(e.person_id));
    if (!newPersonId) continue;
    await tx.query(
      `INSERT INTO public.person_emails (
          circle_code, person_id, email, is_primary, on_current_list, in_audubon_list, is_bouncing, notes,
          google_group_joined_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       ON CONFLICT (circle_code, email) DO NOTHING`,
      [
        String(e.circle_code),
        newPersonId,
        String(e.email).toLowerCase(),
        Boolean(e.is_primary),
        // Older backups and the ETL name the current list after the Google Group it came from.
        Boolean(e.on_current_list ?? e.in_google_group),
        Boolean(e.in_audubon_list),
        Boolean(e.is_bouncing),
        e.notes ? String(e.notes) : null,
        e.google_group_joined_at ? String(e.google_group_joined_at) : null,
      ]
    );
  }
}

/** @returns the number of participations inserted. */
async function restoreParticipations(
  tx: Transaction,
  participations: readonly BackupRow[],
  idMap: ReadonlyMap<number, number>
): Promise<number> {
  let restored = 0;
  for (const pt of participations) {
    const newPersonId = idMap.get(Number(pt.person_id));
    if (!newPersonId) continue;
    const inserted = await tx.query(
      `INSERT INTO public.participations (
          circle_code, count_year, person_id, rsvp_status, counter_type, assigned_area_code,
          is_area_leader, is_new_participant, companions, results_submitted,
          preferred_area_codes, willing_to_switch, submission_method,
          results_submitted_at, form_submitted_at, raw_form_response
       ) VALUES (
          $1, $2, $3, $4::public.rsvp_status, $5::public.counter_type, $6, $7, $8, $9, $10,
          $11::text[], $12, $13, $14::timestamptz, $15::timestamptz, $16::jsonb
       )
       ON CONFLICT (circle_code, count_year, person_id) DO NOTHING`,
      [
        String(pt.circle_code),
        Number(pt.count_year),
        newPersonId,
        String(pt.rsvp_status ?? 'confirmed'),
        pt.counter_type ? String(pt.counter_type) : 'field',
        pt.assigned_area_code ? String(pt.assigned_area_code) : null,
        Boolean(pt.is_area_leader),
        Boolean(pt.is_new_participant),
        pt.companions ? String(pt.companions) : null,
        Boolean(pt.results_submitted),
        Array.isArray(pt.preferred_area_codes) ? pt.preferred_area_codes.map(String) : null,
        typeof pt.willing_to_switch === 'boolean' ? pt.willing_to_switch : null,
        pt.submission_method ? String(pt.submission_method) : null,
        pt.results_submitted_at ? String(pt.results_submitted_at) : null,
        pt.form_submitted_at ? String(pt.form_submitted_at) : null,
        pt.raw_form_response == null ? null : JSON.stringify(pt.raw_form_response),
      ]
    );
    restored += inserted.affectedRows ?? 0;
  }
  return restored;
}

async function restoreNotes(
  tx: Transaction,
  notes: readonly BackupRow[],
  idMap: ReadonlyMap<number, number>
): Promise<void> {
  for (const n of notes) {
    const newPersonId = n.person_id ? (idMap.get(Number(n.person_id)) ?? null) : null;
    await tx.query(
      `INSERT INTO public.notes (
          circle_code, person_id, area_code, count_year, category, body, is_pinned
       ) VALUES ($1, $2, $3, $4, $5::public.note_category, $6, $7)`,
      [
        String(n.circle_code),
        newPersonId,
        n.area_code ? String(n.area_code) : null,
        n.count_year ? Number(n.count_year) : null,
        String(n.category ?? 'general'),
        String(n.body ?? ''),
        Boolean(n.is_pinned),
      ]
    );
  }
}

async function restoreBoundaries(tx: Transaction, boundaries: readonly BackupRow[]): Promise<void> {
  for (const b of boundaries) {
    await tx.query(
      `INSERT INTO public.circle_boundaries (circle_code, area_code, sort_order, label, geometry_geojson)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (circle_code, area_code) DO UPDATE SET
          label = EXCLUDED.label,
          geometry_geojson = EXCLUDED.geometry_geojson`,
      [
        String(b.circle_code),
        String(b.area_code),
        Number(b.sort_order ?? computeSortOrder(String(b.area_code))),
        b.label ? String(b.label) : null,
        JSON.stringify(b.geometry_geojson),
      ]
    );
  }
}

export async function importJsonBackup(db: PGlite, jsonText: string): Promise<{ people: number; participations: number; circles: number }> {
  const data = parseBackup(jsonText);
  const areas = data.areas ?? [];

  return db.transaction(async (tx) => {
    const circles = await restoreCircles(tx, data.saved_circles ?? []);
    await restoreCountYears(tx, data.count_years ?? []);
    await restoreAreas(tx, areas);
    await restoreAreaResults(tx, data.area_results, areas);
    const idMap = await restorePeople(tx, data.people ?? []);
    await restoreEmails(tx, data.person_emails ?? [], idMap);
    const participations = await restoreParticipations(tx, data.participations ?? [], idMap);
    await restoreNotes(tx, data.notes ?? [], idMap);
    await restoreBoundaries(tx, data.circle_boundaries ?? []);
    return { people: idMap.size, participations, circles };
  });
}
