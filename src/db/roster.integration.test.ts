import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissingDefaultRsvpError } from './errors.ts';
import { openTestDb, scalar } from './testing/testDb.ts';
import type { CbcDb } from './cbcDb.ts';
import type { ImportedParticipantRow } from './types.ts';

const CIRCLE = 'INBL';

async function dbWithCircle() {
  const ctx = await openTestDb();
  await ctx.db.upsertFavoriteCircle({
    code: CIRCLE,
    name: 'Bloomington',
    center_lat: 39.1,
    center_lng: -86.5,
    setActive: true,
  });
  return ctx;
}

const row = (email: string, extra: Partial<ImportedParticipantRow> = {}): ImportedParticipantRow => ({
  full_name: email.split('@')[0],
  email,
  ...extra,
});

const seed = (db: CbcDb, rows: ImportedParticipantRow[]) =>
  db.importParticipants(CIRCLE, rows, { updateExisting: true, isCurrentList: false, defaultRsvp: 'no_response' });

test('a new person gets a roster entry and a season record for the current year', async () => {
  const { db, client } = await dbWithCircle();

  const result = await db.importParticipants(
    CIRCLE,
    [row('ada@example.com', { full_name: 'Ada Lovelace', rsvp_status: 'confirmed', area_code: '1A' })],
    { updateExisting: true, isCurrentList: true }
  );

  assert.equal(result.imported, 1);
  const [assignment] = await db.getAssignments(CIRCLE);
  assert.deepEqual(
    [assignment.full_name, assignment.email, assignment.area, assignment.rsvp_status],
    ['Ada Lovelace', 'ada@example.com', '1A', 'confirmed']
  );
  assert.equal(await scalar(client, 'SELECT on_current_list FROM public.person_emails'), true);
});

test('emails match without regard to case and rows without a valid email are skipped', async () => {
  const { db, client } = await dbWithCircle();

  const result = await seed(db, [row('Ada@Example.com'), row('ADA@example.com'), row('not-an-email'), row('')]);

  assert.equal(result.imported, 2);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 1);
});

test('a row with no RSVP and no default stops the whole import', async () => {
  const { db, client } = await dbWithCircle();

  await assert.rejects(
    db.importParticipants(
      CIRCLE,
      [row('first@example.com', { rsvp_status: 'confirmed' }), row('second@example.com')],
      { updateExisting: true, isCurrentList: false }
    ),
    (err) => err instanceof MissingDefaultRsvpError && err.email === 'second@example.com'
  );

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 0);
});

test('with updateExisting off, an existing season record is never changed', async () => {
  const { db } = await dbWithCircle();
  await seed(db, [row('ada@example.com', { rsvp_status: 'confirmed', counter_type: 'field', area_code: '1A' })]);

  await db.importParticipants(
    CIRCLE,
    [row('ada@example.com', { rsvp_status: 'declined_keep', counter_type: 'home_feeders', area_code: '2B' })],
    { updateExisting: false, isCurrentList: false }
  );

  const [assignment] = await db.getAssignments(CIRCLE);
  assert.deepEqual(
    [assignment.rsvp_status, assignment.counter_type, assignment.area],
    ['confirmed', 'field', '1A']
  );
});

test('with updateExisting on, values the file gives replace and values it omits stay', async () => {
  const { db } = await dbWithCircle();
  await seed(db, [row('ada@example.com', { rsvp_status: 'confirmed', counter_type: 'both', area_code: '1A' })]);

  await seed(db, [row('ada@example.com', { rsvp_status: 'undecided' })]);

  const [assignment] = await db.getAssignments(CIRCLE);
  assert.deepEqual(
    [assignment.rsvp_status, assignment.counter_type, assignment.area],
    ['undecided', 'both', '1A']
  );
});

test('importing the current list moves everyone else off it', async () => {
  const { db, client } = await dbWithCircle();
  await db.importParticipants(CIRCLE, [row('old@example.com')], {
    updateExisting: true,
    isCurrentList: true,
    defaultRsvp: 'no_response',
  });

  await db.importParticipants(CIRCLE, [row('new@example.com')], {
    updateExisting: true,
    isCurrentList: true,
    defaultRsvp: 'no_response',
  });

  const onList = await client.query<{ email: string }>(
    'SELECT email::TEXT AS email FROM public.person_emails WHERE on_current_list ORDER BY email'
  );
  assert.deepEqual(onList.rows, [{ email: 'new@example.com' }]);
});

test('an Audubon import adds people but never takes anyone off the current list', async () => {
  const { db, client } = await dbWithCircle();
  await db.importParticipants(CIRCLE, [row('ada@example.com')], {
    updateExisting: true,
    isCurrentList: true,
    defaultRsvp: 'no_response',
  });

  await db.importParticipants(CIRCLE, [row('ada@example.com', { in_audubon_list: true })], {
    updateExisting: false,
    isCurrentList: false,
    defaultRsvp: 'no_response',
  });

  const flags = await client.query<{ on_current_list: boolean; in_audubon_list: boolean }>(
    'SELECT on_current_list, in_audubon_list FROM public.person_emails'
  );
  assert.deepEqual(flags.rows, [{ on_current_list: true, in_audubon_list: true }]);
});

test('importing the same file twice does not repeat a note', async () => {
  const { db, client } = await dbWithCircle();
  const rows = [row('ada@example.com', { note: 'Has a scope', area_code: '1A' })];

  await seed(db, rows);
  await seed(db, rows);

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.notes'), 1);
});

test('an area code in the file matches an existing area in any case', async () => {
  const { db } = await dbWithCircle();
  await seed(db, [row('ada@example.com', { area_code: 'N1' })]);

  await seed(db, [row('grace@example.com', { area_code: 'n1' })]);

  assert.deepEqual((await db.getAreas(CIRCLE)).map((area) => area.code), ['N1']);
});

test('clearing the roster removes people but keeps areas and the circle', async () => {
  const { db, client } = await dbWithCircle();
  await seed(db, [row('ada@example.com', { area_code: '1A', note: 'n' })]);

  await db.clearCircleRoster(CIRCLE);

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 0);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.notes'), 0);
  assert.equal((await db.getAreas(CIRCLE)).length, 1);
});
