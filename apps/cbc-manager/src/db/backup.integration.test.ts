import { test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { BackupFormatError } from './errors.ts';
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
  await db.setAreaCounterNote(CIRCLE, '1A', 'Meet at the boat launch.\nGate code is on the sign-up sheet.');
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

test('an area note survives a backup and restore', async () => {
  const source = await seededDb();
  const target = await openTestDb();

  await target.db.importJsonBackup(await source.db.exportJsonBackup());

  const notes = (await target.db.getAreas(CIRCLE)).map((a) => [a.code, a.counter_note]);
  assert.deepEqual(notes, [['1A', 'Meet at the boat launch.\nGate code is on the sign-up sheet.'], ['2B', null]]);
});

test('a backup from before area notes restores with no note', async () => {
  const source = await seededDb();
  const backup = JSON.parse(await source.db.exportJsonBackup());
  for (const area of backup.areas) delete area.counter_note;
  const target = await openTestDb();

  await target.db.importJsonBackup(JSON.stringify(backup));

  const notes = (await target.db.getAreas(CIRCLE)).map((a) => [a.code, a.counter_note]);
  assert.deepEqual(notes, [['1A', null], ['2B', null]]);
});

test('a backup from before area notes keeps the notes already in the app', async () => {
  const { db } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  for (const area of backup.areas) delete area.counter_note;

  await db.importJsonBackup(JSON.stringify(backup));

  const notes = (await db.getAreas(CIRCLE)).map((a) => [a.code, a.counter_note]);
  assert.deepEqual(notes, [['1A', 'Meet at the boat launch.\nGate code is on the sign-up sheet.'], ['2B', null]]);
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

  await assert.rejects(db.importJsonBackup(JSON.stringify(backup)), /not_a_status/);

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 2);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations'), 2);
});

test('a file that is not a backup is refused and changes nothing', async () => {
  const { db, client } = await seededDb();

  for (const [text, table] of [
    ['not json', null],
    ['[1, 2]', null],
    ['{"people": {"id": 1}}', 'people'],
    ['{"participations": ["x"]}', 'participations'],
  ] as const) {
    await assert.rejects(
      db.importJsonBackup(text),
      (err) => err instanceof BackupFormatError && err.table === table
    );
  }

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 2);
});

test('the restore count leaves out season records whose person is not in the backup', async () => {
  const { db } = await seededDb();
  const backup = JSON.parse(await db.exportJsonBackup());
  backup.participations[0].person_id = -1;

  const counts = await db.importJsonBackup(JSON.stringify(backup));

  assert.deepEqual(counts, { people: 2, participations: 1, circles: 1 });
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

test('results received in an earlier season survive a backup round trip', async () => {
  const source = await seededDb();
  const { db } = source;
  const season = (await db.getSavedCircles())[0].current_year as number;
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });
  await db.setAreaResultsReceived(CIRCLE, '2B', true);
  const target = await openTestDb();

  await target.db.importJsonBackup(await db.exportJsonBackup());

  const rows = await target.client.query<{ count_year: number; area_code: string }>(
    'SELECT count_year, area_code FROM public.area_results ORDER BY count_year, area_code'
  );
  assert.deepEqual(rows.rows, [
    { count_year: season, area_code: '1A' },
    { count_year: season + 1, area_code: '2B' },
  ]);
});

test('a backup from before results were tracked by season marks them for the current season', async () => {
  const source = await seededDb();
  const backup = JSON.parse(await source.db.exportJsonBackup());
  delete backup.area_results;
  for (const area of backup.areas) area.results_received = area.code === '2B';
  const target = await openTestDb();

  await target.db.importJsonBackup(JSON.stringify(backup));

  assert.deepEqual(
    (await target.db.getAreas(CIRCLE)).map((a) => [a.code, a.results_received]),
    [['1A', false], ['2B', true]]
  );
  assert.equal(await scalar(target.client, 'SELECT COUNT(*)::INT FROM public.area_results'), 1);
});

test('restoring a backup from before seasons clears results the app had marked', async () => {
  const source = await seededDb();
  const backup = JSON.parse(await source.db.exportJsonBackup());
  delete backup.area_results;
  for (const area of backup.areas) area.results_received = false;
  const target = await seededDb();
  await target.db.setAreaResultsReceived(CIRCLE, '2B', true);

  await target.db.importJsonBackup(JSON.stringify(backup));

  assert.deepEqual(
    (await target.db.getAreas(CIRCLE)).map((a) => a.results_received),
    [false, false]
  );
});

const PAPER_PARTY = {
  party_id: 'paper-1',
  area_code: '1A',
  start_time: Date.parse('2026-12-19T07:30:00-05:00'),
  stop_time: Date.parse('2026-12-19T16:15:00-05:00'),
  participants: 3,
  car_hours: 4.25,
  foot_hours: 3.5,
  feeder_hours: 0,
  car_miles: 41.2,
  foot_miles: 2.75,
};

test('parties survive a backup and restore', async () => {
  const source = await seededDb();
  await source.db.saveParty(CIRCLE, PAPER_PARTY);
  const target = await openTestDb();

  await target.db.importJsonBackup(await source.db.exportJsonBackup());

  assert.deepEqual(await target.db.getCurrentParties(CIRCLE), [PAPER_PARTY]);
});

test('a restore replaces the circle parties with the backup parties', async () => {
  const { db } = await seededDb();
  await db.saveParty(CIRCLE, PAPER_PARTY);
  const backup = await db.exportJsonBackup();
  await db.saveParty(CIRCLE, { ...PAPER_PARTY, party_id: 'paper-2' });

  await db.importJsonBackup(backup);

  assert.deepEqual((await db.getCurrentParties(CIRCLE)).map((p) => p.party_id), ['paper-1']);
});

const ROUTE = { type: 'MultiLineString', coordinates: [[[-86.5, 39.1], [-86.49, 39.11]]] };

function routeOf(client: PGlite, partyId: string): Promise<unknown> {
  return scalar(client, 'SELECT route_geojson FROM public.parties WHERE party_id = $1', [partyId]);
}

test('a party route survives a backup and restore', async () => {
  const source = await seededDb();
  await source.db.saveParty(CIRCLE, PAPER_PARTY);
  await source.client.query('UPDATE public.parties SET route_geojson = $1::jsonb', [JSON.stringify(ROUTE)]);
  const target = await openTestDb();

  await target.db.importJsonBackup(await source.db.exportJsonBackup());

  assert.deepEqual(await routeOf(target.client, PAPER_PARTY.party_id), ROUTE);
});

test('a backup from before routes restores its parties with no route', async () => {
  const source = await seededDb();
  await source.db.saveParty(CIRCLE, PAPER_PARTY);
  const backup = JSON.parse(await source.db.exportJsonBackup());
  for (const row of backup.parties) delete row.route_geojson;
  const target = await openTestDb();

  await target.db.importJsonBackup(JSON.stringify(backup));

  assert.deepEqual(await target.db.getCurrentParties(CIRCLE), [PAPER_PARTY]);
  assert.equal(await routeOf(target.client, PAPER_PARTY.party_id), null);
});
