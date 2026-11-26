import type { Queryable } from './queryable.ts';

export async function setAsideLegacySchema(tx: Queryable): Promise<void> {
  await tx.exec('ALTER SCHEMA public RENAME TO legacy_single_circle; CREATE SCHEMA public;');
}

export async function moveLegacyRoster(tx: Queryable): Promise<void> {
  await tx.exec(`
  INSERT INTO public.saved_circles (code, name, center_lat, center_lng, is_active)
  VALUES ('LEGACY', 'Circle from older version', 44.83, -93.298, TRUE);

  INSERT INTO public.areas (
      circle_code, code, parent_area_code, sort_order, cities, roads, notable_spots,
      requires_special_access, is_solo_reserved, walking_friendly, active_restrictions
  )
  SELECT 'LEGACY', code, parent_area_code, sort_order, cities, roads, notable_spots,
         requires_special_access, is_solo_reserved, walking_friendly, active_restrictions
  FROM legacy_single_circle.areas;

  INSERT INTO public.count_years (circle_code, year, count_date, is_current, compiler_notes)
  SELECT 'LEGACY', year, count_date, is_current, compiler_notes
  FROM legacy_single_circle.count_years;

  INSERT INTO public.people (
      id, circle_code, full_name, roster_status, experience_level, prefers_hard_copy,
      mailing_address, phone, first_year_participated, created_at, updated_at
  )
  SELECT id, 'LEGACY', full_name, roster_status::text::public.roster_status,
         experience_level, prefers_hard_copy, mailing_address, phone, first_year_participated,
         created_at, updated_at
  FROM legacy_single_circle.people;

  INSERT INTO public.person_emails (
      id, circle_code, person_id, email, is_primary, on_current_list, google_group_joined_at,
      in_audubon_list, is_bouncing, notes, created_at
  )
  SELECT id, 'LEGACY', person_id, email::text, is_primary, in_google_group,
         google_group_joined_at, in_audubon_list, is_bouncing, notes, created_at
  FROM legacy_single_circle.person_emails;

  INSERT INTO public.participations (
      id, circle_code, count_year, person_id, rsvp_status, counter_type, assigned_area_code,
      preferred_area_codes, willing_to_switch, is_area_leader, is_new_participant, companions,
      submission_method, results_submitted, results_submitted_at, form_submitted_at,
      raw_form_response, created_at, updated_at
  )
  SELECT id, 'LEGACY', count_year, person_id,
         rsvp_status::text::public.rsvp_status, counter_type::text::public.counter_type,
         assigned_area_code, preferred_area_codes, willing_to_switch, is_area_leader,
         is_new_participant, companions, submission_method, results_submitted,
         results_submitted_at, form_submitted_at, raw_form_response, created_at, updated_at
  FROM legacy_single_circle.participations;

  INSERT INTO public.notes (
      id, circle_code, person_id, area_code, count_year, category, body, is_pinned, created_at
  )
  SELECT id, 'LEGACY', person_id, area_code, count_year,
         category::text::public.note_category, body, is_pinned, created_at
  FROM legacy_single_circle.notes;

  SELECT setval('public.people_id_seq', COALESCE((SELECT MAX(id) FROM public.people), 0) + 1, FALSE);
  SELECT setval('public.person_emails_id_seq', COALESCE((SELECT MAX(id) FROM public.person_emails), 0) + 1, FALSE);
  SELECT setval('public.participations_id_seq', COALESCE((SELECT MAX(id) FROM public.participations), 0) + 1, FALSE);
  SELECT setval('public.notes_id_seq', COALESCE((SELECT MAX(id) FROM public.notes), 0) + 1, FALSE);

  DROP SCHEMA legacy_single_circle CASCADE;
`);
}
