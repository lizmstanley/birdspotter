-- views.sql
-- Circle-scoped operational views for assignments, open areas, reminders, and possible outreach.

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

-- One row per active person with no answer yet this season, using their best working email.
-- Once the circle has a current list, only people on it need a reminder.
CREATE OR REPLACE VIEW public.v_needs_reminder AS
SELECT
    pe.circle_code,
    pe.id AS person_id,
    pe.full_name,
    (
        SELECT e.email::TEXT
        FROM public.person_emails e
        WHERE e.person_id = pe.id AND e.is_bouncing = FALSE
        ORDER BY e.is_primary DESC, e.id ASC
        LIMIT 1
    ) AS email,
    (
        SELECT MAX(hist.count_year)
        FROM public.participations hist
        WHERE hist.person_id = pe.id AND hist.rsvp_status = 'confirmed'
    ) AS last_year_counted
FROM public.people pe
JOIN public.count_years cy
    ON cy.circle_code = pe.circle_code AND cy.is_current = TRUE
LEFT JOIN public.participations p_curr
    ON p_curr.circle_code = pe.circle_code
   AND p_curr.person_id = pe.id
   AND p_curr.count_year = cy.year
WHERE pe.roster_status = 'active'
  AND (p_curr.id IS NULL OR p_curr.rsvp_status = 'no_response')
  AND (
      EXISTS (
          SELECT 1 FROM public.person_emails e
          WHERE e.person_id = pe.id AND e.on_current_list
      )
      OR NOT EXISTS (
          SELECT 1 FROM public.person_emails e
          WHERE e.circle_code = pe.circle_code AND e.on_current_list
      )
  )
ORDER BY last_year_counted DESC NULLS LAST, pe.full_name;

DROP VIEW IF EXISTS public.v_outreach_candidates;

-- One row per active or inactive person, for one of two reasons:
--   not_on_list: on the Audubon list but not on the compiler's current list (a possible miss).
--   old_email:   on the current list, and also has an email that is not (probably old).
CREATE OR REPLACE VIEW public.v_possible_outreach AS
WITH person_lists AS (
    SELECT
        pe.circle_code,
        pe.id AS person_id,
        pe.full_name,
        pe.roster_status,
        BOOL_OR(e.on_current_list) AS is_on_list,
        (ARRAY_AGG(e.email::TEXT ORDER BY e.is_primary DESC, e.id) FILTER (WHERE e.on_current_list))[1] AS list_email,
        (ARRAY_AGG(e.email::TEXT ORDER BY e.is_primary DESC, e.id)
            FILTER (WHERE e.in_audubon_list AND NOT e.is_bouncing))[1] AS audubon_email,
        STRING_AGG(e.email::TEXT, ', ' ORDER BY e.id) FILTER (WHERE NOT e.on_current_list) AS off_list_emails
    FROM public.people pe
    JOIN public.person_emails e
        ON e.person_id = pe.id
    WHERE pe.roster_status IN ('active', 'inactive')
    GROUP BY pe.circle_code, pe.id, pe.full_name, pe.roster_status
)
SELECT
    pl.circle_code,
    pl.person_id,
    pl.full_name,
    pl.roster_status::TEXT AS roster_status,
    CASE WHEN pl.is_on_list THEN 'old_email' ELSE 'not_on_list' END AS reason,
    CASE WHEN pl.is_on_list THEN pl.list_email ELSE pl.audubon_email END AS email,
    CASE WHEN pl.is_on_list THEN pl.off_list_emails END AS old_emails,
    (
        SELECT MAX(hist.count_year)
        FROM public.participations hist
        WHERE hist.person_id = pl.person_id AND hist.rsvp_status = 'confirmed'
    ) AS last_year_counted,
    COALESCE(
        (
            SELECT STRING_AGG(DISTINCT n.body, ' | ')
            FROM public.notes n
            WHERE n.person_id = pl.person_id AND n.category = 'warning'
        ),
        ''
    ) AS warnings
FROM person_lists pl
WHERE (NOT pl.is_on_list AND pl.audubon_email IS NOT NULL)
   OR (pl.is_on_list AND pl.off_list_emails IS NOT NULL)
ORDER BY reason, last_year_counted DESC NULLS LAST, pl.full_name;
