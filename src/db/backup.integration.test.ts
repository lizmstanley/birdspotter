import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, scalar } from './testing/testDb.ts';
import type { CbcDb } from './cbcDb.ts';

const CIRCLE = 'INBL';
const POLYGON = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };

async function seededDb() {
  const ctx = await openTestDb();
  const { db, client } = ctx;
  await db.upsertFavoriteCircle({
    code: CIRCLE,
    name: 'Bloomington',
    center_lat: 39.1,
    center_lng: -86.5,
    compiler_name: 'Pat Compiler',
    setActive: true,
  });
  await db.importParticipants(
    CIRCLE,
    [
      { full_name: 'Ada Lovelace', email: 'ada@example.com', rsvp_status: 'confirmed', counter_type: 'both', area_code: '1A', note: 'Has a scope' },
      { full_name: 'Grace Hopper', email: 'grace@example.com', rsvp_status: 'undecided', area_code: '2B' },
    ],
    { updateExisting: true, isCurrentList: true }
  );
  await db.setAreaResultsReceived(CIRCLE, '1A', true);
  await db.setAreaCounted(CIRCLE, '2B', false);
  await client.query(`UPDATE public.areas SET parent_area_code = '1A' WHERE code = '2B'`);
  await db.upsertCircleBoundaries(CIRCLE, [{ code: '1A', name: 'North', geometry: POLYGON }]);
  return ctx;
}

async function snapshot(db: CbcDb) {
  const assignments = await db.getAssignments(CIRCLE);
  return {
    circles: await db.getSavedCircles(),
    areas: await db.getAreas(CIRCLE),
    boundaries: await db.getCircleBoundaries(CIRCLE),
    assignments: assignments.map((a) => ({ ...a, participation_id: 0, person_id: 0 })),
    reminders: (await db.getNeedsReminder(CIRCLE)).map((r) => ({ ...r, person_id: 0 })),
  };
}

test('a backup restored into an empty database reproduces the roster and areas', async () => {
  const source = await seededDb();
  const backup = await source.db.exportJsonBackup();
  const target = await openTestDb();

  const counts = await target.db.importJsonBackup(backup);

  assert.deepEqual(counts, { people: 2, participations: 2, circles: 1 });
  assert.deepEqual(await snapshot(target.db), await snapshot(source.db));
  assert.equal(
    await scalar(target.client, `SELECT parent_area_code FROM public.areas WHERE code = '2B'`),
    '1A'
  );
});

test('restoring a backup over the same circle replaces its roster without duplicates', async () => {
  const { db, client } = await seededDb();
  const backup = await db.exportJsonBackup();

  await db.importJsonBackup(backup);
  await db.importJsonBackup(backup);

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 2);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations'), 2);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.notes'), 1);
});

test('person ids in the backup are remapped so every email and season stays with its person', async () => {
  const source = await seededDb();
  const backup = JSON.parse(await source.db.exportJsonBackup());
  const shift = 1000;
  for (const table of ['people', 'person_emails', 'participations', 'notes']) {
    for (const rec of backup[table]) {
      if (rec.person_id != null) rec.person_id += shift;
      if (table === 'people') rec.id += shift;
    }
  }
  const target = await openTestDb();

  await target.db.importJsonBackup(JSON.stringify(backup));

  const rows = await target.client.query<{ full_name: string; email: string; rsvp_status: string }>(
    `SELECT pe.full_name, e.email::TEXT AS email, p.rsvp_status::TEXT AS rsvp_status
     FROM public.people pe
     JOIN public.person_emails e ON e.person_id = pe.id
     JOIN public.participations p ON p.person_id = pe.id
     ORDER BY pe.full_name`
  );
  assert.deepEqual(rows.rows, [
    { full_name: 'Ada Lovelace', email: 'ada@example.com', rsvp_status: 'confirmed' },
    { full_name: 'Grace Hopper', email: 'grace@example.com', rsvp_status: 'undecided' },
  ]);
});

test('a backup that fails midway leaves the existing data untouched', async () => {
  const { db, client } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  backup.participations[0].rsvp_status = 'not_a_status';

  await assert.rejects(db.importJsonBackup(JSON.stringify(backup)));

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 2);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations'), 2);
});

test('an older backup without area flags keeps the flags already in the app', async () => {
  const { db } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  for (const area of backup.areas) {
    delete area.is_counted;
    delete area.results_received;
  }

  await db.importJsonBackup(JSON.stringify(backup));

  const areas = await db.getAreas(CIRCLE);
  assert.deepEqual(
    areas.map((a) => [a.code, a.is_counted, a.results_received]),
    [['1A', true, true], ['2B', false, false]]
  );
});

test('a backup that names the current list after the Google Group still restores it', async () => {
  const { db, client } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  for (const email of backup.person_emails) {
    email.in_google_group = email.on_current_list;
    delete email.on_current_list;
  }
  await client.query('UPDATE public.person_emails SET on_current_list = FALSE');

  await db.importJsonBackup(JSON.stringify(backup));

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.person_emails WHERE on_current_list'), 2);
});

test('restoring keeps outlines of areas that the backup does not mention', async () => {
  const { db } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  backup.circle_boundaries = [];

  await db.importJsonBackup(JSON.stringify(backup));

  assert.equal((await db.getCircleBoundaries(CIRCLE)).length, 1);
});
