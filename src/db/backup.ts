import type { PGlite } from '@electric-sql/pglite';
import { computeSortOrder } from './areas.ts';

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export async function exportJsonBackup(db: PGlite): Promise<string> {
  const [circles, areas, people, emails, years, participations, notes, boundaries] = await Promise.all([
    db.query('SELECT * FROM public.saved_circles ORDER BY name'),
    db.query('SELECT * FROM public.areas ORDER BY circle_code, sort_order, code'),
    db.query('SELECT * FROM public.people ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.person_emails ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.count_years ORDER BY circle_code, year'),
    db.query('SELECT * FROM public.participations ORDER BY circle_code, count_year, id'),
    db.query('SELECT * FROM public.notes ORDER BY circle_code, id'),
    db.query('SELECT * FROM public.circle_boundaries ORDER BY circle_code, sort_order, area_code'),
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
    },
    null,
    2
  );
}

export async function importJsonBackup(db: PGlite, jsonText: string): Promise<{ people: number; participations: number; circles: number }> {
  const data = JSON.parse(jsonText) as {
    saved_circles?: Array<Record<string, unknown>>;
    count_years?: Array<Record<string, unknown>>;
    areas?: Array<Record<string, unknown>>;
    people?: Array<Record<string, unknown>>;
    person_emails?: Array<Record<string, unknown>>;
    participations?: Array<Record<string, unknown>>;
    notes?: Array<Record<string, unknown>>;
    circle_boundaries?: Array<Record<string, unknown>>;
  };
  const circles = data.saved_circles ?? [];
  const years = data.count_years ?? [];
  const areas = data.areas ?? [];
  const people = data.people ?? [];
  const emails = data.person_emails ?? [];
  const participations = data.participations ?? [];
  const notes = data.notes ?? [];
  const boundaries = data.circle_boundaries ?? [];

  await db.transaction(async (tx) => {
    // Upsert circles and clear roster data for the imported circle(s) while keeping KML boundaries
    for (const c of circles) {
      const code = String(c.code ?? '').trim().toUpperCase();
      if (!code) continue;
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
          Number(c.radius_miles ?? 7.5),
          Boolean(c.is_active),
          c.compiler_name ? String(c.compiler_name) : null,
          c.compiler_email ? String(c.compiler_email) : null,
          c.count_date ? String(c.count_date) : null,
          c.audubon_url ? String(c.audubon_url) : null,
        ]
      );
      // Clear old roster rows for this circle before restoring
      await tx.query('DELETE FROM public.notes WHERE circle_code = $1', [code]);
      await tx.query('DELETE FROM public.participations WHERE circle_code = $1', [code]);
      await tx.query('DELETE FROM public.person_emails WHERE circle_code = $1', [code]);
      await tx.query('DELETE FROM public.people WHERE circle_code = $1', [code]);
      await tx.query('DELETE FROM public.count_years WHERE circle_code = $1', [code]);
    }

    for (const y of years) {
      await tx.query(
        `INSERT INTO public.count_years (circle_code, year, count_date, is_current, compiler_notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (circle_code, year) DO UPDATE SET is_current = EXCLUDED.is_current`,
        [
          String(y.circle_code),
          Number(y.year),
          y.count_date ? String(y.count_date) : null,
          Boolean(y.is_current),
          y.compiler_notes ? String(y.compiler_notes) : null,
        ]
      );
    }

    for (const a of areas) {
      await tx.query(
        `INSERT INTO public.areas (
            circle_code, code, sort_order, cities, roads, notable_spots, active_restrictions, is_counted,
            requires_special_access, is_solo_reserved, walking_friendly, results_received
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, COALESCE($8::BOOLEAN, TRUE),
            COALESCE($9::BOOLEAN, FALSE), COALESCE($10::BOOLEAN, FALSE), $11, COALESCE($12::BOOLEAN, FALSE)
         )
         ON CONFLICT (circle_code, code) DO UPDATE SET
            cities = COALESCE(EXCLUDED.cities, public.areas.cities),
            roads = COALESCE(EXCLUDED.roads, public.areas.roads),
            notable_spots = COALESCE(EXCLUDED.notable_spots, public.areas.notable_spots),
            active_restrictions = COALESCE(EXCLUDED.active_restrictions, public.areas.active_restrictions),
            is_counted = COALESCE($8::BOOLEAN, public.areas.is_counted),
            requires_special_access = COALESCE($9::BOOLEAN, public.areas.requires_special_access),
            is_solo_reserved = COALESCE($10::BOOLEAN, public.areas.is_solo_reserved),
            walking_friendly = COALESCE(EXCLUDED.walking_friendly, public.areas.walking_friendly),
            results_received = COALESCE($12::BOOLEAN, public.areas.results_received)`,
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
          optionalBoolean(a.results_received),
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

    for (const pt of participations) {
      const newPersonId = idMap.get(Number(pt.person_id));
      if (!newPersonId) continue;
      await tx.query(
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
    }

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
  });

  return { people: people.length, participations: participations.length, circles: circles.length };
}
