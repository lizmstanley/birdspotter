-- Brings a database created before schema_version existed up to the 001 schema.
-- Every statement is a no-op on a database that already matches.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS is_counted BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS results_received BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS compiler_name TEXT;
ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS compiler_email TEXT;
ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS count_date TEXT;
ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS audubon_url TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'person_emails' AND column_name = 'in_google_group'
    ) THEN
        ALTER TABLE public.person_emails RENAME COLUMN in_google_group TO on_current_list;
    END IF;
END
$$;

-- A composite foreign key with plain SET NULL also nulls circle_code, which is NOT NULL,
-- so deleting an area failed. Restrict SET NULL to the area column.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN (
            'areas_circle_code_parent_area_code_fkey',
            'participations_circle_code_assigned_area_code_fkey'
        )
        AND confdelsetcols IS NULL
    ) THEN
        ALTER TABLE public.areas
            DROP CONSTRAINT areas_circle_code_parent_area_code_fkey,
            ADD CONSTRAINT areas_circle_code_parent_area_code_fkey
                FOREIGN KEY (circle_code, parent_area_code)
                REFERENCES public.areas(circle_code, code) ON DELETE SET NULL (parent_area_code);
        ALTER TABLE public.participations
            DROP CONSTRAINT participations_circle_code_assigned_area_code_fkey,
            ADD CONSTRAINT participations_circle_code_assigned_area_code_fkey
                FOREIGN KEY (circle_code, assigned_area_code)
                REFERENCES public.areas(circle_code, code) ON DELETE SET NULL (assigned_area_code);
    END IF;
END
$$;
