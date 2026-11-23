import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import schemaSql from '../../db/migrations/001_initial_schema.sql?raw';
import viewsSql from '../../db/migrations/002_views.sql?raw';

export interface SavedCircle {
  code: string;
  name: string;
  state_province: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  is_favorite: boolean;
  is_active: boolean;
  compiler_name: string | null;
  compiler_email: string | null;
  count_date: string | null;
  audubon_url: string | null;
}

export interface AssignmentRow {
  circle_code: string;
  participation_id: number;
  person_id: number;
  area: string | null;
  cities: string | null;
  full_name: string;
  email: string | null;
  rsvp_status: string;
  counter_type: string | null;
  is_area_leader: boolean;
  companions: string | null;
  active_notes: string;
  first_year_participated: number | null;
  seasons_counted: number;
}

export interface PersonHistory {
  person: {
    id: number;
    full_name: string;
    roster_status: string;
    experience_level: string | null;
    phone: string | null;
    first_year_participated: number | null;
    current_year: number | null;
  };
  emails: Array<{ email: string; is_primary: boolean; in_google_group: boolean; in_audubon_list: boolean }>;
  seasons: Array<{
    count_year: number;
    rsvp_status: string;
    assigned_area_code: string | null;
    is_area_leader: boolean;
    counter_type: string | null;
    preferred_area_codes: string[] | null;
    notes: string[];
  }>;
}

export interface OpenAreaRow {
  circle_code: string;
  area: string;
  cities: string | null;
  notable_spots: string | null;
  walking_friendly: boolean | null;
  active_restrictions: string | null;
  confirmed_field_counters: number;
  feeder_only_counters: number;
}

export interface ReminderRow {
  circle_code: string;
  person_id: number;
  full_name: string;
  email: string;
  last_year_counted: number | null;
}

export interface OutreachRow {
  circle_code: string;
  person_id: number;
  full_name: string;
  email: string;
  roster_status: string;
  last_year_counted: number | null;
  warnings: string;
}

export interface AreaOption {
  code: string;
  cities: string | null;
  notable_spots?: string | null;
  is_counted: boolean;
  results_received: boolean;
}

export interface AreaBoundaryRow {
  circle_code: string;
  code: string;
  label: string | null;
  boundary_geojson: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'Point';
    coordinates: unknown;
  };
}

export interface ImportedParticipantRow {
  full_name: string;
  email: string;
  area_code?: string | null;
  rsvp_status?: string;
  counter_type?: string;
  note?: string;
  in_google_group?: boolean;
  in_audubon_list?: boolean;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function computeSortOrder(code: string): number {
  const m = code.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) * 10 : 9999;
}

function normalizeRsvp(raw?: string): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (t === 'no_response') return 'no_response';
  if (!t || t.includes('yes') || t === 'confirmed') return 'confirmed';
  if (t.includes('undecided') || t.includes('maybe')) return 'undecided';
  if (t.includes('remove')) return 'declined_remove';
  if (t.includes('no')) return 'declined_keep';
  return 'confirmed';
}

function normalizeCounterType(raw?: string): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (t.includes('feeder')) return 'home_feeders';
  if (t.includes('both')) return 'both';
  if (t.includes('coord')) return 'coordinator_only';
  return 'field';
}

export class LegacyMigrationError extends Error {
  constructor(cause: unknown) {
    super(
      'pgliteDb: could not move your roster from the older database format. Nothing was changed.',
      { cause }
    );
    this.name = 'LegacyMigrationError';
  }
}

export class LocalCbcDb {
  private db: PGlite | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.db = await PGlite.create('idb://cbc-circle-manager-pgdata', {
        extensions: { citext },
      });

      const hasPeople = await this.columnExists(this.db, 'people', 'id');
      const hasCircles = await this.columnExists(this.db, 'people', 'circle_code');

      if (!hasPeople) {
        await this.db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await this.db.exec(schemaSql);
        await this.db.exec(viewsSql);
      } else if (!hasCircles) {
        await this.migrateSingleCircleDatabase(this.db);
      } else {
        // Non-destructive migration: add areas.is_counted if missing (preserves user data)
        if (!(await this.columnExists(this.db, 'areas', 'is_counted'))) {
          await this.db.exec(
            'ALTER TABLE public.areas ADD COLUMN is_counted BOOLEAN NOT NULL DEFAULT TRUE;'
          );
        }
        // Non-destructive migration: add areas.results_received & saved_circles Audubon info columns
        await this.db.exec(`
          ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS results_received BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS compiler_name TEXT;
          ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS compiler_email TEXT;
          ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS count_date TEXT;
          ALTER TABLE public.saved_circles ADD COLUMN IF NOT EXISTS audubon_url TEXT;
        `);
        await this.limitAreaSetNullToAreaColumns(this.db);
        // Views hold no data; CREATE OR REPLACE brings an existing database to the current definitions.
        await this.db.exec(viewsSql);
      }
    })();
    return this.initPromise;
  }

  private getDb(): PGlite {
    if (!this.db) throw new Error('PGlite not initialized');
    return this.db;
  }

  private async columnExists(db: PGlite, table: string, column: string): Promise<boolean> {
    const res = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists`,
      [table, column]
    );
    return Boolean(res.rows[0]?.exists);
  }

  /**
   * Moves a roster from the older single-circle schema into one circle of the current schema.
   * Runs in one transaction: on any failure the old data stays where it was.
   */
  private async migrateSingleCircleDatabase(db: PGlite): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await tx.exec('ALTER SCHEMA public RENAME TO legacy_single_circle; CREATE SCHEMA public;');
        await tx.exec(schemaSql);
        await tx.exec(viewsSql);
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
              id, circle_code, person_id, email, is_primary, in_google_group, google_group_joined_at,
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
      });
    } catch (err) {
      throw new LegacyMigrationError(err);
    }
  }

  /**
   * A composite foreign key with plain SET NULL also nulls circle_code, which is NOT NULL,
   * so deleting an area failed. Databases created before the fix still have the old keys.
   */
  private async limitAreaSetNullToAreaColumns(db: PGlite): Promise<void> {
    const stale = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN (
            'areas_circle_code_parent_area_code_fkey',
            'participations_circle_code_assigned_area_code_fkey'
          )
          AND confdelsetcols IS NULL
      ) AS exists`
    );
    if (!stale.rows[0]?.exists) return;
    await db.exec(`
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
    `);
  }

  async getSavedCircles(): Promise<SavedCircle[]> {
    const res = await this.getDb().query<SavedCircle>(
      `SELECT code, name, state_province, center_lat, center_lng, radius_miles, is_favorite, is_active,
              compiler_name, compiler_email, count_date, audubon_url
       FROM public.saved_circles
       ORDER BY is_active DESC, name ASC`
    );
    return res.rows;
  }

  async upsertFavoriteCircle(circle: {
    code: string;
    name: string;
    state_province?: string | null;
    center_lat: number;
    center_lng: number;
    radius_miles?: number;
    compiler_name?: string | null;
    compiler_email?: string | null;
    count_date?: string | null;
    audubon_url?: string | null;
    setActive?: boolean;
  }): Promise<void> {
    const db = this.getDb();
    const code = circle.code.trim().toUpperCase();
    const currentYear = new Date().getFullYear();

    await db.transaction(async (tx) => {
      if (circle.setActive) {
        await tx.query('UPDATE public.saved_circles SET is_active = FALSE WHERE is_active = TRUE');
      }
      await tx.query(
        `INSERT INTO public.saved_circles (
            code, name, state_province, center_lat, center_lng, radius_miles, is_favorite, is_active,
            compiler_name, compiler_email, count_date, audubon_url
         )
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10, $11)
         ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            state_province = COALESCE(EXCLUDED.state_province, public.saved_circles.state_province),
            center_lat = EXCLUDED.center_lat,
            center_lng = EXCLUDED.center_lng,
            compiler_name = COALESCE(EXCLUDED.compiler_name, public.saved_circles.compiler_name),
            compiler_email = COALESCE(EXCLUDED.compiler_email, public.saved_circles.compiler_email),
            count_date = COALESCE(EXCLUDED.count_date, public.saved_circles.count_date),
            audubon_url = COALESCE(EXCLUDED.audubon_url, public.saved_circles.audubon_url),
            is_favorite = TRUE,
            is_active = CASE WHEN $7 THEN TRUE ELSE public.saved_circles.is_active END`,
        [
          code,
          circle.name.trim(),
          circle.state_province ?? null,
          circle.center_lat,
          circle.center_lng,
          circle.radius_miles ?? 7.5,
          Boolean(circle.setActive),
          circle.compiler_name ?? null,
          circle.compiler_email ?? null,
          circle.count_date ?? null,
          circle.audubon_url ?? null,
        ]
      );

      // Ensure the circle has an active count_year row so views work immediately
      await tx.query(
        `INSERT INTO public.count_years (circle_code, year, is_current)
         SELECT $1, $2, TRUE
         WHERE NOT EXISTS (
           SELECT 1 FROM public.count_years WHERE circle_code = $1 AND is_current = TRUE
         )
         ON CONFLICT (circle_code, year) DO NOTHING`,
        [code, currentYear]
      );
    });
  }

  async setActiveCircle(code: string): Promise<void> {
    const db = this.getDb();
    await db.transaction(async (tx) => {
      await tx.query('UPDATE public.saved_circles SET is_active = FALSE WHERE is_active = TRUE');
      await tx.query('UPDATE public.saved_circles SET is_active = TRUE WHERE code = $1', [code]);
    });
  }

  async removeFavoriteCircle(code: string): Promise<void> {
    const db = this.getDb();
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM public.saved_circles WHERE code = $1', [code]);
      const active = await tx.query<{ code: string }>(
        'SELECT code FROM public.saved_circles WHERE is_active = TRUE LIMIT 1'
      );
      if (active.rows.length === 0) {
        await tx.query(
          `UPDATE public.saved_circles
           SET is_active = TRUE
           WHERE code = (SELECT code FROM public.saved_circles ORDER BY name ASC LIMIT 1)`
        );
      }
    });
  }

  async updateActiveCircleCenter(code: string, lat: number, lng: number): Promise<void> {
    await this.getDb().query(
      'UPDATE public.saved_circles SET center_lat = $1, center_lng = $2 WHERE code = $3',
      [lat, lng, code]
    );
  }

  async renameCircle(code: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await this.getDb().query(
      'UPDATE public.saved_circles SET name = $1 WHERE code = $2',
      [trimmed, code]
    );
  }

  async updateCircleInfo(
    code: string,
    info: {
      compiler_name?: string | null;
      compiler_email?: string | null;
      count_date?: string | null;
      audubon_url?: string | null;
    }
  ): Promise<void> {
    await this.getDb().query(
      `UPDATE public.saved_circles
       SET compiler_name = $1,
           compiler_email = $2,
           count_date = $3,
           audubon_url = $4
       WHERE code = $5`,
      [
        info.compiler_name?.trim() || null,
        info.compiler_email?.trim() || null,
        info.count_date?.trim() || null,
        info.audubon_url?.trim() || null,
        code,
      ]
    );
  }

  async getAssignments(circleCode: string): Promise<AssignmentRow[]> {
    return (
      await this.getDb().query<AssignmentRow>(
        'SELECT * FROM public.v_current_assignments WHERE circle_code = $1',
        [circleCode]
      )
    ).rows;
  }

  async getPersonHistory(personId: number): Promise<PersonHistory | null> {
    const db = this.getDb();
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
        `SELECT email::TEXT AS email, is_primary, in_google_group, in_audubon_list
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

  async getOpenAreas(circleCode: string): Promise<OpenAreaRow[]> {
    return (
      await this.getDb().query<OpenAreaRow>(
        'SELECT * FROM public.v_open_areas WHERE circle_code = $1',
        [circleCode]
      )
    ).rows;
  }

  async getNeedsReminder(circleCode: string): Promise<ReminderRow[]> {
    return (
      await this.getDb().query<ReminderRow>(
        'SELECT * FROM public.v_needs_reminder WHERE circle_code = $1',
        [circleCode]
      )
    ).rows;
  }

  async getOutreachCandidates(circleCode: string): Promise<OutreachRow[]> {
    return (
      await this.getDb().query<OutreachRow>(
        'SELECT * FROM public.v_outreach_candidates WHERE circle_code = $1',
        [circleCode]
      )
    ).rows;
  }

  async getAreas(circleCode: string): Promise<AreaOption[]> {
    return (
      await this.getDb().query<AreaOption>(
        'SELECT code, cities, notable_spots, is_counted, results_received FROM public.areas WHERE circle_code = $1 ORDER BY sort_order, code',
        [circleCode]
      )
    ).rows;
  }

  async getCircleBoundaries(circleCode: string): Promise<AreaBoundaryRow[]> {
    return (
      await this.getDb().query<AreaBoundaryRow>(
        `SELECT circle_code, area_code AS code, label, geometry_geojson AS boundary_geojson
         FROM public.circle_boundaries
         WHERE circle_code = $1
         ORDER BY sort_order, area_code`,
        [circleCode]
      )
    ).rows;
  }

  async upsertCircleBoundaries(
    circleCode: string,
    boundaries: Array<{ code: string; name: string; geometry: unknown; isOuterCircle?: boolean }>
  ): Promise<{ saved: number }> {
    const db = this.getDb();
    let saved = 0;
    await db.transaction(async (tx) => {
      for (const b of boundaries) {
        const areaCode = b.code.trim();
        if (!areaCode) continue;
        await tx.query(
          `INSERT INTO public.circle_boundaries (circle_code, area_code, sort_order, label, geometry_geojson)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (circle_code, area_code) DO UPDATE SET
              label = EXCLUDED.label,
              geometry_geojson = EXCLUDED.geometry_geojson`,
          [circleCode, areaCode, computeSortOrder(areaCode), b.name || null, JSON.stringify(b.geometry)]
        );
        // Ensure real sectors exist in public.areas, but skip outer-circle outlines
        if (!b.isOuterCircle) {
          await tx.query(
            `INSERT INTO public.areas (circle_code, code, sort_order, notable_spots)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (circle_code, code) DO NOTHING`,
            [circleCode, areaCode, computeSortOrder(areaCode), b.name || null]
          );
        }
        saved += 1;
      }
    });
    return { saved };
  }

  async setAreaCounted(circleCode: string, areaCode: string, isCounted: boolean): Promise<void> {
    await this.getDb().query(
      `INSERT INTO public.areas (circle_code, code, sort_order, is_counted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (circle_code, code) DO UPDATE SET is_counted = EXCLUDED.is_counted`,
      [circleCode, areaCode, computeSortOrder(areaCode), isCounted]
    );
  }

  async setAreaResultsReceived(circleCode: string, areaCode: string, received: boolean): Promise<void> {
    await this.getDb().query(
      `INSERT INTO public.areas (circle_code, code, sort_order, results_received)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (circle_code, code) DO UPDATE SET results_received = EXCLUDED.results_received`,
      [circleCode, areaCode, computeSortOrder(areaCode), received]
    );
  }

  async deleteArea(circleCode: string, areaCode: string): Promise<void> {
    await this.getDb().query(
      'DELETE FROM public.areas WHERE circle_code = $1 AND code = $2',
      [circleCode, areaCode]
    );
  }

  async clearCircleBoundaries(circleCode: string): Promise<void> {
    await this.getDb().query('DELETE FROM public.circle_boundaries WHERE circle_code = $1', [circleCode]);
  }

  async clearCircleRoster(circleCode: string): Promise<void> {
    const db = this.getDb();
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM public.notes WHERE circle_code = $1', [circleCode]);
      await tx.query('DELETE FROM public.participations WHERE circle_code = $1', [circleCode]);
      await tx.query('DELETE FROM public.person_emails WHERE circle_code = $1', [circleCode]);
      await tx.query('DELETE FROM public.people WHERE circle_code = $1', [circleCode]);
    });
  }

  async reassignArea(participationId: number, newAreaCode: string | null): Promise<void> {
    await this.getDb().query(
      'UPDATE public.participations SET assigned_area_code = $1 WHERE id = $2',
      [newAreaCode || null, participationId]
    );
  }

  async importParticipants(
    circleCode: string,
    rows: ImportedParticipantRow[]
  ): Promise<{ imported: number }> {
    const db = this.getDb();
    let imported = 0;

    await db.transaction(async (tx) => {
      const yearRes = await tx.query<{ year: number }>(
        'SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current = TRUE LIMIT 1',
        [circleCode]
      );
      const currentYear = yearRes.rows[0]?.year ?? new Date().getFullYear();
      await tx.query(
        `INSERT INTO public.count_years (circle_code, year, is_current)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (circle_code, year) DO NOTHING`,
        [circleCode, currentYear]
      );

      for (const r of rows) {
        const email = r.email.trim().toLowerCase();
        const fullName = r.full_name.trim() || email.split('@')[0];
        if (!email || !email.includes('@')) continue;

        const areaCode = r.area_code?.trim() || null;
        if (areaCode) {
          await tx.query(
            `INSERT INTO public.areas (circle_code, code, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (circle_code, code) DO NOTHING`,
            [circleCode, areaCode, computeSortOrder(areaCode)]
          );
        }

        const existing = await tx.query<{ person_id: number }>(
          'SELECT person_id FROM public.person_emails WHERE circle_code = $1 AND email = $2 LIMIT 1',
          [circleCode, email]
        );

        let personId: number;
        if (existing.rows[0]) {
          personId = existing.rows[0].person_id;
          if (r.in_audubon_list) {
            await tx.query(
              'UPDATE public.person_emails SET in_audubon_list = TRUE WHERE circle_code = $1 AND email = $2',
              [circleCode, email]
            );
          }
        } else {
          const inserted = await tx.query<{ id: number }>(
            `INSERT INTO public.people (circle_code, full_name, roster_status)
             VALUES ($1, $2, 'active')
             RETURNING id`,
            [circleCode, fullName]
          );
          personId = inserted.rows[0].id;

          await tx.query(
            `INSERT INTO public.person_emails (circle_code, person_id, email, is_primary, in_google_group, in_audubon_list)
             VALUES ($1, $2, $3, TRUE, $4, $5)
             ON CONFLICT (circle_code, email) DO NOTHING`,
            [circleCode, personId, email, Boolean(r.in_google_group), Boolean(r.in_audubon_list)]
          );
        }

        await tx.query(
          `INSERT INTO public.participations (
              circle_code, count_year, person_id, rsvp_status, counter_type, assigned_area_code
           )
           VALUES ($1, $2, $3, $4::public.rsvp_status, $5::public.counter_type, $6)
           ON CONFLICT (circle_code, count_year, person_id) DO UPDATE SET
              rsvp_status = EXCLUDED.rsvp_status,
              counter_type = EXCLUDED.counter_type,
              assigned_area_code = COALESCE(EXCLUDED.assigned_area_code, public.participations.assigned_area_code)`,
          [
            circleCode,
            currentYear,
            personId,
            normalizeRsvp(r.rsvp_status),
            normalizeCounterType(r.counter_type),
            areaCode,
          ]
        );

        if (r.note?.trim()) {
          await tx.query(
            `INSERT INTO public.notes (circle_code, person_id, area_code, count_year, category, body, is_pinned)
             VALUES ($1, $2, $3, $4, 'general', $5, FALSE)`,
            [circleCode, personId, areaCode, currentYear, r.note.trim()]
          );
        }

        imported += 1;
      }
    });

    return { imported };
  }

  async exportJsonBackup(): Promise<string> {
    const db = this.getDb();
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

  async importJsonBackup(jsonText: string): Promise<{ people: number; participations: number; circles: number }> {
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

    const db = this.getDb();
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
              circle_code, person_id, email, is_primary, in_google_group, in_audubon_list, is_bouncing, notes,
              google_group_joined_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
           ON CONFLICT (circle_code, email) DO NOTHING`,
          [
            String(e.circle_code),
            newPersonId,
            String(e.email).toLowerCase(),
            Boolean(e.is_primary),
            Boolean(e.in_google_group),
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
}
