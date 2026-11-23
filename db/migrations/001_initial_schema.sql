-- 001_initial_schema.sql
-- Pure PostgreSQL multi-circle schema for CBC Circle Manager (runs in PGlite / IndexedDB).
-- All areas, count years, participants, assignments, notes, and boundaries are scoped per circle_code.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.roster_status AS ENUM (
    'active',
    'inactive',
    'removed_requested',
    'removed_no_show',
    'moved_away',
    'deceased',
    'external_contact'
);

CREATE TYPE public.rsvp_status AS ENUM (
    'no_response',
    'confirmed',
    'undecided',
    'declined_keep',
    'declined_remove',
    'cancelled',
    'no_show'
);

CREATE TYPE public.counter_type AS ENUM (
    'field',
    'home_feeders',
    'both',
    'coordinator_only'
);

CREATE TYPE public.note_category AS ENUM (
    'general',
    'coordination',
    'warning',
    'future_compiler'
);

-- ---------------------------------------------------------------------------
-- Updated-at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Saved Circles ("My Circles")
-- ---------------------------------------------------------------------------
CREATE TABLE public.saved_circles (
    code                    TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    state_province          TEXT,
    center_lat              DOUBLE PRECISION NOT NULL,
    center_lng              DOUBLE PRECISION NOT NULL,
    radius_miles            DOUBLE PRECISION NOT NULL DEFAULT 7.5,
    is_favorite             BOOLEAN NOT NULL DEFAULT TRUE,
    is_active               BOOLEAN NOT NULL DEFAULT FALSE,
    compiler_name           TEXT,
    compiler_email          TEXT,
    count_date              TEXT,
    audubon_url             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_single_active_circle
    ON public.saved_circles (is_active)
    WHERE is_active = TRUE;

CREATE TRIGGER trg_saved_circles_updated_at
    BEFORE UPDATE ON public.saved_circles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 1. People (scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.people (
    id                      BIGSERIAL PRIMARY KEY,
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    full_name               TEXT NOT NULL,
    roster_status           public.roster_status NOT NULL DEFAULT 'active',
    experience_level        TEXT,
    prefers_hard_copy       BOOLEAN NOT NULL DEFAULT FALSE,
    mailing_address         TEXT,
    phone                   TEXT,
    first_year_participated SMALLINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_people_circle_code ON public.people (circle_code);

CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON public.people
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Person Emails (unique per circle_code, case-insensitive)
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_emails (
    id                      BIGSERIAL PRIMARY KEY,
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    person_id               BIGINT NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    email                   extensions.citext NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT FALSE,
    on_current_list         BOOLEAN NOT NULL DEFAULT FALSE,
    google_group_joined_at  TIMESTAMPTZ,
    in_audubon_list         BOOLEAN NOT NULL DEFAULT FALSE,
    is_bouncing             BOOLEAN NOT NULL DEFAULT FALSE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (circle_code, email)
);

CREATE UNIQUE INDEX uq_person_primary_email
    ON public.person_emails (person_id)
    WHERE is_primary = TRUE;

CREATE INDEX idx_person_emails_person_id
    ON public.person_emails (person_id);

-- ---------------------------------------------------------------------------
-- 3. Count Areas (scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.areas (
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    code                    TEXT NOT NULL,
    parent_area_code        TEXT,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    cities                  TEXT,
    roads                   TEXT,
    notable_spots           TEXT,
    requires_special_access BOOLEAN NOT NULL DEFAULT FALSE,
    is_solo_reserved        BOOLEAN NOT NULL DEFAULT FALSE,
    walking_friendly        BOOLEAN,
    active_restrictions     TEXT,
    is_counted              BOOLEAN NOT NULL DEFAULT TRUE,
    results_received        BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (circle_code, code),
    FOREIGN KEY (circle_code, parent_area_code)
        REFERENCES public.areas(circle_code, code) ON DELETE SET NULL (parent_area_code)
);

-- ---------------------------------------------------------------------------
-- 4. Count Years (seasons, scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.count_years (
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    year                    SMALLINT NOT NULL,
    count_date              DATE,
    is_current              BOOLEAN NOT NULL DEFAULT FALSE,
    compiler_notes          TEXT,
    PRIMARY KEY (circle_code, year)
);

CREATE UNIQUE INDEX uq_single_current_year_per_circle
    ON public.count_years (circle_code)
    WHERE is_current = TRUE;

-- ---------------------------------------------------------------------------
-- 5. Participations (annual RSVP & area assignment, scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.participations (
    id                      BIGSERIAL PRIMARY KEY,
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    count_year              SMALLINT NOT NULL,
    person_id               BIGINT NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    rsvp_status             public.rsvp_status NOT NULL DEFAULT 'no_response',
    counter_type            public.counter_type,
    assigned_area_code      TEXT,
    preferred_area_codes    TEXT[],
    willing_to_switch       BOOLEAN,
    is_area_leader          BOOLEAN NOT NULL DEFAULT FALSE,
    is_new_participant      BOOLEAN NOT NULL DEFAULT FALSE,
    companions              TEXT,
    submission_method       TEXT,
    results_submitted       BOOLEAN NOT NULL DEFAULT FALSE,
    results_submitted_at    TIMESTAMPTZ,
    form_submitted_at       TIMESTAMPTZ,
    raw_form_response       JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (circle_code, count_year, person_id),
    FOREIGN KEY (circle_code, count_year)
        REFERENCES public.count_years(circle_code, year) ON DELETE CASCADE,
    FOREIGN KEY (circle_code, assigned_area_code)
        REFERENCES public.areas(circle_code, code) ON DELETE SET NULL (assigned_area_code)
);

CREATE INDEX idx_participations_circle_year_area
    ON public.participations (circle_code, count_year, assigned_area_code);

CREATE INDEX idx_participations_person_id
    ON public.participations (person_id);

CREATE TRIGGER trg_participations_updated_at
    BEFORE UPDATE ON public.participations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Notes (typed, pinnable, scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.notes (
    id                      BIGSERIAL PRIMARY KEY,
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    person_id               BIGINT REFERENCES public.people(id) ON DELETE CASCADE,
    area_code               TEXT,
    count_year              SMALLINT,
    category                public.note_category NOT NULL DEFAULT 'general',
    body                    TEXT NOT NULL,
    is_pinned               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_circle_code ON public.notes (circle_code);
CREATE INDEX idx_notes_person_id ON public.notes (person_id);

-- ---------------------------------------------------------------------------
-- 7. Circle Boundaries (KML/KMZ/GeoJSON polygons scoped per circle_code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.circle_boundaries (
    circle_code             TEXT NOT NULL REFERENCES public.saved_circles(code) ON DELETE CASCADE,
    area_code               TEXT NOT NULL,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    label                   TEXT,
    geometry_geojson        JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (circle_code, area_code)
);

CREATE INDEX idx_circle_boundaries_circle_code
    ON public.circle_boundaries (circle_code);
