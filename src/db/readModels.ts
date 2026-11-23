import type { PGlite } from '@electric-sql/pglite';
import type {
  AssignmentRow,
  OpenAreaRow,
  PersonHistory,
  PossibleOutreachRow,
  ReminderRow,
} from './types.ts';

export async function getAssignments(db: PGlite, circleCode: string): Promise<AssignmentRow[]> {
  return (
    await db.query<AssignmentRow>(
      'SELECT * FROM public.v_current_assignments WHERE circle_code = $1',
      [circleCode]
    )
  ).rows;
}

export async function getPersonHistory(db: PGlite, personId: number): Promise<PersonHistory | null> {
  const person = await db.query<PersonHistory['person']>(
    `SELECT pe.id, pe.full_name, pe.roster_status::TEXT AS roster_status, pe.experience_level, pe.phone,
            pe.first_year_participated, cy.year AS current_year
     FROM public.people pe
     LEFT JOIN public.count_years cy ON cy.circle_code = pe.circle_code AND cy.is_current
     WHERE pe.id = $1`,
    [personId]
  );
  if (!person.rows[0]) return null;
  const [emails, seasons] = await Promise.all([
    db.query<PersonHistory['emails'][number]>(
      `SELECT email::TEXT AS email, is_primary, on_current_list, in_audubon_list
       FROM public.person_emails WHERE person_id = $1
       ORDER BY is_primary DESC, email`,
      [personId]
    ),
    db.query<PersonHistory['seasons'][number]>(
      `SELECT y.count_year, COALESCE(p.rsvp_status::TEXT, 'no record') AS rsvp_status,
              p.assigned_area_code, COALESCE(p.is_area_leader, FALSE) AS is_area_leader,
              p.counter_type::TEXT AS counter_type, p.preferred_area_codes,
              COALESCE(ARRAY(
                SELECT n.body FROM public.notes n
                WHERE n.person_id = $1 AND n.count_year = y.count_year
                ORDER BY n.id
              ), ARRAY[]::TEXT[]) AS notes
       FROM (
         SELECT count_year FROM public.participations WHERE person_id = $1
         UNION
         SELECT count_year FROM public.notes WHERE person_id = $1 AND count_year IS NOT NULL
       ) y
       LEFT JOIN public.participations p ON p.person_id = $1 AND p.count_year = y.count_year
       ORDER BY y.count_year DESC`,
      [personId]
    ),
  ]);
  return { person: person.rows[0], emails: emails.rows, seasons: seasons.rows };
}

export async function getOpenAreas(db: PGlite, circleCode: string): Promise<OpenAreaRow[]> {
  return (
    await db.query<OpenAreaRow>(
      'SELECT * FROM public.v_open_areas WHERE circle_code = $1',
      [circleCode]
    )
  ).rows;
}

export async function getNeedsReminder(db: PGlite, circleCode: string): Promise<ReminderRow[]> {
  return (
    await db.query<ReminderRow>(
      'SELECT * FROM public.v_needs_reminder WHERE circle_code = $1',
      [circleCode]
    )
  ).rows;
}

export async function getPossibleOutreach(db: PGlite, circleCode: string): Promise<PossibleOutreachRow[]> {
  return (
    await db.query<PossibleOutreachRow>(
      `SELECT circle_code, person_id, full_name, roster_status, reason, email, old_emails,
              last_year_counted, warnings
       FROM public.v_possible_outreach WHERE circle_code = $1`,
      [circleCode]
    )
  ).rows;
}
