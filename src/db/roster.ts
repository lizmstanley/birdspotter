import type { PGlite } from '@electric-sql/pglite';
import { normalizeCounterType, normalizeRsvp } from '../services/importPreview.ts';
import { seasonInPreparation } from '../services/season.ts';
import { ensureArea } from './areas.ts';
import { MissingDefaultRsvpError } from './errors.ts';
import type { ImportedParticipantRow, ImportOptions } from './types.ts';

export async function clearCircleRoster(db: PGlite, circleCode: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM public.notes WHERE circle_code = $1', [circleCode]);
    await tx.query('DELETE FROM public.participations WHERE circle_code = $1', [circleCode]);
    await tx.query('DELETE FROM public.person_emails WHERE circle_code = $1', [circleCode]);
    await tx.query('DELETE FROM public.people WHERE circle_code = $1', [circleCode]);
  });
}

export async function reassignArea(db: PGlite, participationId: number, newAreaCode: string | null): Promise<void> {
  await db.query(
    'UPDATE public.participations SET assigned_area_code = $1 WHERE id = $2',
    [newAreaCode || null, participationId]
  );
}

export async function importParticipants(
  db: PGlite,
  circleCode: string,
  rows: ImportedParticipantRow[],
  options: ImportOptions
): Promise<{ imported: number }> {
  let imported = 0;

  await db.transaction(async (tx) => {
    const yearRes = await tx.query<{ year: number }>(
      'SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current = TRUE LIMIT 1',
      [circleCode]
    );
    const currentYear = yearRes.rows[0]?.year ?? seasonInPreparation(new Date());
    await tx.query(
      `INSERT INTO public.count_years (circle_code, year, is_current)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (circle_code, year) DO NOTHING`,
      [circleCode, currentYear]
    );
    if (options.isCurrentList) {
      await tx.query('UPDATE public.person_emails SET on_current_list = FALSE WHERE circle_code = $1', [
        circleCode,
      ]);
    }

    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      const fullName = r.full_name.trim() || email.split('@')[0];
      if (!email || !email.includes('@')) continue;

      const fileAreaCode = r.area_code?.trim() || null;
      const areaCode = fileAreaCode ? await ensureArea(tx, circleCode, fileAreaCode) : null;

      const existing = await tx.query<{ person_id: number }>(
        'SELECT person_id FROM public.person_emails WHERE circle_code = $1 AND email = $2 LIMIT 1',
        [circleCode, email]
      );

      let personId: number;
      if (existing.rows[0]) {
        personId = existing.rows[0].person_id;
        await tx.query(
          `UPDATE public.person_emails
           SET in_audubon_list = in_audubon_list OR $3, on_current_list = on_current_list OR $4
           WHERE circle_code = $1 AND email = $2`,
          [circleCode, email, Boolean(r.in_audubon_list), options.isCurrentList]
        );
      } else {
        const inserted = await tx.query<{ id: number }>(
          `INSERT INTO public.people (circle_code, full_name, roster_status)
           VALUES ($1, $2, 'active')
           RETURNING id`,
          [circleCode, fullName]
        );
        personId = inserted.rows[0].id;

        await tx.query(
          `INSERT INTO public.person_emails (circle_code, person_id, email, is_primary, in_audubon_list, on_current_list)
           VALUES ($1, $2, $3, TRUE, $4, $5)
           ON CONFLICT (circle_code, email) DO NOTHING`,
          [circleCode, personId, email, Boolean(r.in_audubon_list), options.isCurrentList]
        );
      }

      const fileRsvp = r.rsvp_status ? normalizeRsvp(r.rsvp_status) : null;
      const fileCounterType = r.counter_type ? normalizeCounterType(r.counter_type) : null;
      const stored = await tx.query<{ rsvp_status: string }>(
        `SELECT rsvp_status FROM public.participations
         WHERE circle_code = $1 AND count_year = $2 AND person_id = $3`,
        [circleCode, currentYear, personId]
      );
      const newRsvp = fileRsvp ?? stored.rows[0]?.rsvp_status ?? options.defaultRsvp;
      if (!newRsvp) throw new MissingDefaultRsvpError(email);

      // A value the file does not give keeps the one already stored.
      await tx.query(
        `INSERT INTO public.participations (
            circle_code, count_year, person_id, rsvp_status, counter_type, assigned_area_code
         )
         VALUES ($1, $2, $3, $4::public.rsvp_status, $5::public.counter_type, $6)
         ON CONFLICT (circle_code, count_year, person_id) DO UPDATE SET
            rsvp_status = COALESCE($7::public.rsvp_status, public.participations.rsvp_status),
            counter_type = COALESCE($8::public.counter_type, public.participations.counter_type),
            assigned_area_code = COALESCE(EXCLUDED.assigned_area_code, public.participations.assigned_area_code)
         WHERE $9::BOOLEAN`,
        [
          circleCode,
          currentYear,
          personId,
          newRsvp,
          fileCounterType ?? 'field',
          areaCode,
          fileRsvp,
          fileCounterType,
          options.updateExisting,
        ]
      );

      if (r.note?.trim()) {
        // Importing the same file again must not repeat the note.
        await tx.query(
          `INSERT INTO public.notes (circle_code, person_id, area_code, count_year, category, body, is_pinned)
           SELECT $1, $2, $3::TEXT, $4::SMALLINT, 'general', $5::TEXT, FALSE
           WHERE NOT EXISTS (
             SELECT 1 FROM public.notes
             WHERE circle_code = $1 AND person_id = $2 AND count_year = $4::SMALLINT AND body = $5::TEXT
           )`,
          [circleCode, personId, areaCode, currentYear, r.note.trim()]
        );
      }

      imported += 1;
    }
  });

  return { imported };
}
