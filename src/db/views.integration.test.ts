import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './testing/testDb.ts';
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

const load = (db: CbcDb, rows: ImportedParticipantRow[], isCurrentList = false) =>
  db.importParticipants(CIRCLE, rows, { updateExisting: true, isCurrentList, defaultRsvp: 'no_response' });

test('an area is open until a confirmed field counter is assigned', async () => {
  const { db } = await dbWithCircle();
  await load(db, [
    { full_name: 'Ada', email: 'ada@example.com', rsvp_status: 'confirmed', counter_type: 'field', area_code: '1A' },
    { full_name: 'Grace', email: 'grace@example.com', rsvp_status: 'confirmed', counter_type: 'home_feeders', area_code: '2B' },
    { full_name: 'Linus', email: 'linus@example.com', rsvp_status: 'undecided', counter_type: 'field', area_code: '3C' },
  ]);

  const open = await db.getOpenAreas(CIRCLE);

  assert.deepEqual(
    open.map((area) => [area.area, area.feeder_only_counters]),
    [
      ['2B', 1],
      ['3C', 0],
    ]
  );
});

test('an area marked not counted is never open', async () => {
  const { db } = await dbWithCircle();
  await db.setAreaCounted(CIRCLE, '9Z', false);
  await db.setAreaCounted(CIRCLE, '8Y', true);

  assert.deepEqual((await db.getOpenAreas(CIRCLE)).map((area) => area.area), ['8Y']);
});

test('reminders skip people who answered and follow the current list once one exists', async () => {
  const { db } = await dbWithCircle();
  await load(db, [
    { full_name: 'Answered', email: 'answered@example.com', rsvp_status: 'confirmed' },
    { full_name: 'Silent', email: 'silent@example.com' },
    { full_name: 'Off List', email: 'offlist@example.com' },
  ]);
  assert.deepEqual(
    (await db.getNeedsReminder(CIRCLE)).map((r) => r.full_name),
    ['Off List', 'Silent'],
    'with no current list everyone silent is reminded'
  );

  await load(db, [{ full_name: 'Silent', email: 'silent@example.com' }], true);

  assert.deepEqual((await db.getNeedsReminder(CIRCLE)).map((r) => r.full_name), ['Silent']);
});

test('a person on the Audubon list but not the current list is possible outreach', async () => {
  const { db } = await dbWithCircle();
  await load(db, [{ full_name: 'Listed', email: 'listed@example.com' }], true);
  await db.importParticipants(
    CIRCLE,
    [{ full_name: 'Missed', email: 'missed@example.com', in_audubon_list: true }],
    { updateExisting: false, isCurrentList: false, defaultRsvp: 'no_response' }
  );

  const outreach = await db.getPossibleOutreach(CIRCLE);

  assert.deepEqual(
    outreach.map((o) => [o.full_name, o.reason, o.email]),
    [['Missed', 'not_on_list', 'missed@example.com']]
  );
});

test('a person on the current list with another email is flagged for an old email', async () => {
  const { db, client } = await dbWithCircle();
  await load(db, [{ full_name: 'Ada', email: 'ada@new.example.com' }], true);
  await client.query(
    `INSERT INTO public.person_emails (circle_code, person_id, email, is_primary)
     SELECT circle_code, person_id, 'ada@old.example.com', FALSE FROM public.person_emails`
  );

  const outreach = await db.getPossibleOutreach(CIRCLE);

  assert.deepEqual(
    outreach.map((o) => [o.reason, o.email, o.old_emails]),
    [['old_email', 'ada@new.example.com', 'ada@old.example.com']]
  );
});
