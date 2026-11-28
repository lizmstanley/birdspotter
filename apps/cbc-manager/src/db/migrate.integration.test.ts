import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { LegacyMigrationError, SchemaTooNewError } from './errors.ts';
import { dbOver, migrations, openMemoryClient, openTestDb, scalar, viewsSql } from './testing/testDb.ts';

const versionsOf = (client: PGlite) =>
  client
    .query<{ version: number }>('SELECT version FROM public.schema_version ORDER BY version')
    .then((res) => res.rows.map((row) => row.version));

async function openUnversionedClient(): Promise<PGlite> {
  const client = await openMemoryClient();
  await client.exec(migrations[0].sql);
  await client.exec(`
    ALTER TABLE public.areas DROP COLUMN is_counted, DROP COLUMN results_received;
    ALTER TABLE public.saved_circles
      DROP COLUMN compiler_name, DROP COLUMN compiler_email, DROP COLUMN count_date, DROP COLUMN audubon_url;
    ALTER TABLE public.person_emails RENAME COLUMN on_current_list TO in_google_group;
    ALTER TABLE public.participations
      DROP CONSTRAINT participations_circle_code_assigned_area_code_fkey,
      ADD CONSTRAINT participations_circle_code_assigned_area_code_fkey
        FOREIGN KEY (circle_code, assigned_area_code)
        REFERENCES public.areas(circle_code, code) ON DELETE SET NULL;
    INSERT INTO public.saved_circles (code, name, center_lat, center_lng, is_active)
      VALUES ('INBL', 'Bloomington', 39.1, -86.5, TRUE);
    INSERT INTO public.count_years (circle_code, year, is_current) VALUES ('INBL', 2026, TRUE);
    INSERT INTO public.areas (circle_code, code, sort_order) VALUES ('INBL', '1A', 10);
    INSERT INTO public.people (circle_code, full_name) VALUES ('INBL', 'Ada Lovelace');
    INSERT INTO public.person_emails (circle_code, person_id, email, in_google_group)
      VALUES ('INBL', 1, 'ada@example.com', TRUE);
    INSERT INTO public.participations (circle_code, count_year, person_id, rsvp_status, assigned_area_code)
      VALUES ('INBL', 2026, 1, 'confirmed', '1A');
  `);
  return client;
}

test('a new database applies every migration and the views', async () => {
  const { client } = await openTestDb();
  assert.deepEqual(await versionsOf(client), migrations.map((m) => m.version));
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM information_schema.views WHERE table_schema = 'public'`), 5);
});

test('opening an up-to-date database again keeps its data and versions', async () => {
  const { db, client } = await openTestDb();
  await db.upsertFavoriteCircle({ code: 'inbl', name: 'Bloomington', center_lat: 39.1, center_lng: -86.5 });

  await dbOver(client).init();

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.saved_circles'), 1);
  assert.deepEqual(await versionsOf(client), migrations.map((m) => m.version));
});

test('a database from before versioning is upgraded and keeps its roster', async () => {
  const client = await openUnversionedClient();

  await dbOver(client).init();

  assert.deepEqual(await versionsOf(client), migrations.map((m) => m.version));
  assert.equal(
    await scalar(client, `SELECT on_current_list FROM public.person_emails WHERE email = 'ada@example.com'`),
    true
  );
  assert.equal(await scalar(client, `SELECT is_counted FROM public.areas WHERE code = '1A'`), true);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.participations`), 1);
});

test('results already marked received move to the current season', async () => {
  const client = await openMemoryClient();
  await client.exec(migrations[0].sql);
  await client.exec(`
    INSERT INTO public.saved_circles (code, name, center_lat, center_lng) VALUES ('INBL', 'Bloomington', 39.1, -86.5);
    INSERT INTO public.count_years (circle_code, year, is_current) VALUES ('INBL', 2025, FALSE), ('INBL', 2026, TRUE);
    INSERT INTO public.areas (circle_code, code, sort_order, results_received) VALUES
      ('INBL', '1A', 10, TRUE), ('INBL', '2B', 20, FALSE);
  `);

  await dbOver(client).init();

  const moved = await client.query<{ count_year: number; area_code: string }>(
    'SELECT count_year, area_code FROM public.area_results'
  );
  assert.deepEqual(moved.rows, [{ count_year: 2026, area_code: '1A' }]);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM information_schema.columns WHERE table_name = 'areas' AND column_name = 'results_received'`), 0);
});

test('after the upgrade, deleting an area clears only the assignment', async () => {
  const client = await openUnversionedClient();
  const db = dbOver(client);
  await db.init();

  await db.deleteArea('INBL', '1A');

  const row = await client.query<{ circle_code: string; assigned_area_code: string | null }>(
    'SELECT circle_code, assigned_area_code FROM public.participations'
  );
  assert.deepEqual(row.rows, [{ circle_code: 'INBL', assigned_area_code: null }]);
});

test('a database upgraded by a newer app is refused and left alone', async () => {
  const { client } = await openTestDb();
  await client.query(`INSERT INTO public.schema_version (version, name) VALUES (99, 'from_the_future')`);

  await assert.rejects(
    dbOver(client).init(),
    (err) =>
      err instanceof SchemaTooNewError &&
      err.databaseVersion === 99 &&
      err.latestKnownVersion === migrations.length
  );
});

test('a migration that fails leaves no trace of itself', async () => {
  const { client } = await openTestDb();
  const failing = [
    ...migrations,
    {
      version: migrations.length + 1,
      name: 'half_done',
      sql: 'CREATE TABLE public.half_done (id INT); SELECT 1/0;',
    },
  ];

  await assert.rejects(dbOver(client, failing).init(), /division by zero/);

  assert.equal(await scalar(client, `SELECT to_regclass('public.half_done') IS NULL`), true);
  assert.deepEqual(await versionsOf(client), migrations.map((m) => m.version));
});

async function openLegacyClient(rosterStatus: string): Promise<PGlite> {
  const client = await openMemoryClient();
  await client.exec(`
    CREATE TYPE public.roster_status AS ENUM ('active', 'inactive');
    CREATE TYPE public.rsvp_status AS ENUM ('confirmed', 'no_response');
    CREATE TYPE public.counter_type AS ENUM ('field', 'home_feeders');
    CREATE TYPE public.note_category AS ENUM ('general', 'warning');
    CREATE TABLE public.areas (
      code TEXT PRIMARY KEY, parent_area_code TEXT, sort_order INT, cities TEXT, roads TEXT,
      notable_spots TEXT, requires_special_access BOOLEAN DEFAULT FALSE, is_solo_reserved BOOLEAN DEFAULT FALSE,
      walking_friendly BOOLEAN, active_restrictions TEXT);
    CREATE TABLE public.count_years (
      year SMALLINT PRIMARY KEY, count_date DATE, is_current BOOLEAN, compiler_notes TEXT);
    CREATE TABLE public.people (
      id SERIAL PRIMARY KEY, full_name TEXT, roster_status TEXT, experience_level TEXT,
      prefers_hard_copy BOOLEAN DEFAULT FALSE, mailing_address TEXT, phone TEXT,
      first_year_participated INT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE public.person_emails (
      id SERIAL PRIMARY KEY, person_id INT, email TEXT, is_primary BOOLEAN, in_google_group BOOLEAN,
      google_group_joined_at TIMESTAMPTZ, in_audubon_list BOOLEAN DEFAULT FALSE,
      is_bouncing BOOLEAN DEFAULT FALSE, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE public.participations (
      id SERIAL PRIMARY KEY, count_year SMALLINT, person_id INT, rsvp_status TEXT, counter_type TEXT,
      assigned_area_code TEXT, preferred_area_codes TEXT[], willing_to_switch BOOLEAN,
      is_area_leader BOOLEAN DEFAULT FALSE, is_new_participant BOOLEAN DEFAULT FALSE, companions TEXT,
      submission_method TEXT, results_submitted BOOLEAN DEFAULT FALSE, results_submitted_at TIMESTAMPTZ,
      form_submitted_at TIMESTAMPTZ, raw_form_response JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE public.notes (
      id SERIAL PRIMARY KEY, person_id INT, area_code TEXT, count_year SMALLINT, category TEXT,
      body TEXT, is_pinned BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO public.areas (code, sort_order) VALUES ('1A', 10);
    INSERT INTO public.count_years (year, is_current) VALUES (2025, TRUE);
    INSERT INTO public.people (full_name, roster_status) VALUES ('Grace Hopper', '${rosterStatus}');
    INSERT INTO public.person_emails (person_id, email, is_primary, in_google_group)
      VALUES (1, 'grace@example.com', TRUE, TRUE);
    INSERT INTO public.participations (count_year, person_id, rsvp_status, counter_type, assigned_area_code)
      VALUES (2025, 1, 'confirmed', 'field', '1A');
    INSERT INTO public.notes (person_id, category, body) VALUES (1, 'general', 'Brings a scope');
  `);
  return client;
}

test('a single-circle database moves into one circle and later inserts get new ids', async () => {
  const client = await openLegacyClient('active');
  const db = dbOver(client);

  await db.init();

  const assignments = await db.getAssignments('LEGACY');
  assert.deepEqual(
    assignments.map((a) => [a.full_name, a.area, a.email, a.active_notes]),
    [['Grace Hopper', '1A', 'grace@example.com', '']]
  );
  assert.equal(await scalar(client, `SELECT on_current_list FROM public.person_emails`), true);
  assert.equal(await scalar(client, `SELECT to_regnamespace('legacy_single_circle') IS NULL`), true);
  const next = await client.query<{ id: number }>(
    `INSERT INTO public.people (circle_code, full_name) VALUES ('LEGACY', 'Next Person') RETURNING id`
  );
  assert.equal(next.rows[0].id, 2);
});

test('a single-circle database that cannot be moved keeps its old data', async () => {
  const client = await openLegacyClient('not_a_status');
  const db = dbOver(client);

  await assert.rejects(db.init(), (err) => err instanceof LegacyMigrationError);

  assert.equal(await scalar(client, `SELECT full_name FROM public.people`), 'Grace Hopper');
  assert.equal(await scalar(client, `SELECT to_regnamespace('legacy_single_circle') IS NULL`), true);
});

test('views alone can be re-applied to a current database', async () => {
  const { client } = await openTestDb();
  await client.exec(viewsSql);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.v_open_areas`), 0);
});
