-- 002_views.sql
-- Circle-scoped operational views for assignments, open areas, reminders, and safe outreach.

CREATE OR REPLACE VIEW public.v_current_assignments AS
SELECT
    p.circle_code,
    p.id AS participation_id,
    pe.id AS person_id,
    p.assigned_area_code AS area,
    a.sort_order AS area_sort_order,
    a.cities,
    pe.full_name,
    (
        SELECT e.email::TEXT
        FROM public.person_emails e
        WHERE e.person_id = pe.id
        ORDER BY e.is_primary DESC, e.id ASC
        LIMIT 1
    ) AS email,
    p.rsvp_status,
    p.counter_type,
    p.is_area_leader,
    p.companions,
    -- A pinned note from an earlier season still applies; label it with its season.
    COALESCE(
        STRING_AGG(
            DISTINCT CASE
                WHEN n.count_year IS NOT NULL AND n.count_year <> cy.year AND n.body !~ '^\d{4}'
                    THEN n.count_year || ': ' || n.body
                ELSE n.body
            END,
            ' | '
        ) FILTER (WHERE n.is_pinned OR n.count_year = cy.year),
        ''
    ) AS active_notes,
    pe.first_year_participated,
    (
        SELECT COUNT(*)::INT
        FROM public.participations past
        WHERE past.person_id = pe.id
          AND past.count_year < cy.year
          AND past.rsvp_status = 'confirmed'
          AND past.assigned_area_code IS NOT NULL
    ) AS seasons_counted
FROM public.participations p
JOIN public.count_years cy
    ON cy.circle_code = p.circle_code
   AND cy.year = p.count_year
   AND cy.is_current = TRUE
JOIN public.people pe
    ON pe.id = p.person_id
LEFT JOIN public.areas a
    ON a.circle_code = p.circle_code
   AND a.code = p.assigned_area_code
-- A person's notes stay on their own row; only notes with no person apply to everyone in the area.
LEFT JOIN public.notes n
    ON n.circle_code = p.circle_code
   AND (
        n.person_id = pe.id
        OR (n.person_id IS NULL AND n.area_code = p.assigned_area_code)
   )
WHERE p.rsvp_status IN ('confirmed', 'undecided')
GROUP BY
    p.circle_code,
    p.id,
    pe.id,
    pe.first_year_participated,
    cy.year,
    p.assigned_area_code,
    a.sort_order,
    a.cities,
    pe.full_name,
    p.rsvp_status,
    p.counter_type,
    p.is_area_leader,
    p.companions
ORDER BY
    a.sort_order NULLS LAST,
    p.assigned_area_code NULLS LAST,
    p.is_area_leader DESC,
    pe.full_name;

CREATE OR REPLACE VIEW public.v_open_areas AS
SELECT
    a.circle_code,
    a.code AS area,
    a.sort_order,
    a.cities,
    a.notable_spots,
    a.walking_friendly,
    a.active_restrictions,
    COUNT(p.id) FILTER (
        WHERE p.rsvp_status = 'confirmed' AND p.counter_type IN ('field', 'both')
    )::INT AS confirmed_field_counters,
    COUNT(p.id) FILTER (
        WHERE p.rsvp_status = 'confirmed' AND p.counter_type = 'home_feeders'
    )::INT AS feeder_only_counters
FROM public.areas a
JOIN public.count_years cy
    ON cy.circle_code = a.circle_code
   AND cy.is_current = TRUE
LEFT JOIN public.participations p
    ON p.circle_code = a.circle_code
   AND p.assigned_area_code = a.code
   AND p.count_year = cy.year
WHERE a.is_counted = TRUE
GROUP BY
    a.circle_code,
    a.code,
    a.sort_order,
    a.cities,
    a.notable_spots,
    a.walking_friendly,
    a.active_restrictions
HAVING COUNT(p.id) FILTER (
    WHERE p.rsvp_status = 'confirmed' AND p.counter_type IN ('field', 'both')
) = 0
ORDER BY a.sort_order, a.code;

CREATE OR REPLACE VIEW public.v_needs_reminder AS
SELECT
    pe.circle_code,
    pe.id AS person_id,
    pe.full_name,
    e.email::TEXT AS email,
    MAX(p_hist.count_year) FILTER (WHERE p_hist.rsvp_status = 'confirmed') AS last_year_counted
FROM public.people pe
JOIN public.person_emails e
    ON e.person_id = pe.id AND e.in_google_group = TRUE
JOIN public.count_years cy
    ON cy.circle_code = pe.circle_code AND cy.is_current = TRUE
LEFT JOIN public.participations p_curr
    ON p_curr.circle_code = pe.circle_code
   AND p_curr.person_id = pe.id
   AND p_curr.count_year = cy.year
LEFT JOIN public.participations p_hist
    ON p_hist.circle_code = pe.circle_code
   AND p_hist.person_id = pe.id
WHERE pe.roster_status = 'active'
  AND (p_curr.id IS NULL OR p_curr.rsvp_status = 'no_response')
GROUP BY pe.circle_code, pe.id, pe.full_name, e.email
ORDER BY last_year_counted DESC NULLS LAST, pe.full_name;

CREATE OR REPLACE VIEW public.v_outreach_candidates AS
SELECT
    pe.circle_code,
    pe.id AS person_id,
    pe.full_name,
    e.email::TEXT AS email,
    pe.roster_status,
    MAX(p.count_year) FILTER (WHERE p.rsvp_status = 'confirmed') AS last_year_counted,
    COALESCE(
        STRING_AGG(DISTINCT n.body, ' | ') FILTER (WHERE n.category = 'warning'),
        ''
    ) AS warnings
FROM public.people pe
JOIN public.person_emails e
    ON e.person_id = pe.id
LEFT JOIN public.participations p
    ON p.circle_code = pe.circle_code AND p.person_id = pe.id
LEFT JOIN public.notes n
    ON n.circle_code = pe.circle_code AND n.person_id = pe.id
WHERE pe.roster_status IN ('active', 'inactive')
  AND NOT EXISTS (
      SELECT 1
      FROM public.person_emails e2
      WHERE e2.person_id = pe.id AND e2.in_google_group = TRUE
  )
  AND e.is_bouncing = FALSE
GROUP BY pe.circle_code, pe.id, pe.full_name, e.email, pe.roster_status
ORDER BY last_year_counted DESC NULLS LAST, pe.full_name;
