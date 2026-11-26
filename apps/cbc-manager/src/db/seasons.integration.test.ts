import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeasonRolloverError } from './errors.ts';
import { openTestDb, scalar } from './testing/testDb.ts';
import type { CbcDb } from './cbcDb.ts';
import type { ImportedParticipantRow } from './types.ts';

const CIRCLE = 'INBL';

async function dbWithSeason() {
  const ctx = await openTestDb();
  await ctx.db.upsertFavoriteCircle({
    code: CIRCLE,
    name: 'Bloomington',
    center_lat: 39.1,
    center_lng: -86.5,
    setActive: true,
  });
  const season = (await ctx.db.getSavedCircles())[0].current_year as number;
  return { ...ctx, season };
}

const load = (db: CbcDb, rows: ImportedParticipantRow[]) =>
  db.importParticipants(CIRCLE, rows, { updateExisting: true, isCurrentList: true, defaultRsvp: 'no_response' });

const participationsFor = (db: CbcDb, year: number) =>
  db.getPersonHistory(1).then((history) => history?.seasons.find((s) => s.count_year === year));

test('a rollover makes the new year current and keeps the old year', async () => {
  const { db, client, season } = await dbWithSeason();

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  const years = await client.query<{ year: number; is_current: boolean }>(
    'SELECT year, is_current FROM public.count_years ORDER BY year'
  );
  assert.deepEqual(years.rows, [
    { year: season, is_current: false },
    { year: season + 1, is_current: true },
  ]);
  assert.equal((await db.getSavedCircles())[0].current_year, season + 1);
});

test('carrying assignments keeps the area and resets the RSVP for confirmed and undecided people', async () => {
  const { db, client, season } = await dbWithSeason();
  await load(db, [
    { full_name: 'Ada', email: 'ada@example.com', rsvp_status: 'confirmed', counter_type: 'both', area_code: '1A' },
    { full_name: 'Grace', email: 'grace@example.com', rsvp_status: 'undecided', area_code: '2B' },
    { full_name: 'Linus', email: 'linus@example.com', rsvp_status: 'declined_keep', area_code: '3C' },
    { full_name: 'Margaret', email: 'margaret@example.com', rsvp_status: 'confirmed' },
  ]);
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: true });

  const carried = await client.query<{ full_name: string; rsvp_status: string; assigned_area_code: string; counter_type: string }>(
    `SELECT pe.full_name, p.rsvp_status::TEXT AS rsvp_status, p.assigned_area_code, p.counter_type::TEXT AS counter_type
     FROM public.participations p JOIN public.people pe ON pe.id = p.person_id
     WHERE p.count_year = $1 ORDER BY pe.full_name`,
    [season + 1]
  );
  assert.deepEqual(carried.rows, [
    { full_name: 'Ada', rsvp_status: 'no_response', assigned_area_code: '1A', counter_type: 'both' },
    { full_name: 'Grace', rsvp_status: 'no_response', assigned_area_code: '2B', counter_type: 'field' },
  ]);
});

test('people not carried over have no record for the new season and are asked for an RSVP', async () => {
  const { db, client, season } = await dbWithSeason();
  await load(db, [
    { full_name: 'Linus', email: 'linus@example.com', rsvp_status: 'declined_keep', area_code: '3C' },
    { full_name: 'Margaret', email: 'margaret@example.com', rsvp_status: 'confirmed' },
  ]);

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: true });

  assert.equal(
    await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations WHERE count_year = $1', [season + 1]),
    0
  );
  assert.deepEqual(
    (await db.getNeedsReminder(CIRCLE)).map((r) => r.full_name),
    ['Margaret', 'Linus']
  );
});

test('without carrying, no assignment moves to the new season', async () => {
  const { db, client, season } = await dbWithSeason();
  await load(db, [{ full_name: 'Ada', email: 'ada@example.com', rsvp_status: 'confirmed', area_code: '1A' }]);

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  assert.equal(
    await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations WHERE count_year = $1', [season + 1]),
    0
  );
  assert.equal((await db.getAssignments(CIRCLE)).length, 0);
});

test('an inactive person is not carried over', async () => {
  const { db, client, season } = await dbWithSeason();
  await load(db, [{ full_name: 'Ada', email: 'ada@example.com', rsvp_status: 'confirmed', area_code: '1A' }]);
  await client.query(`UPDATE public.people SET roster_status = 'moved_away'`);

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: true });

  assert.equal(
    await scalar(client, 'SELECT COUNT(*)::INT FROM public.participations WHERE count_year = $1', [season + 1]),
    0
  );
});

test('results received start empty in the new season and the old season keeps its record', async () => {
  const { db, client, season } = await dbWithSeason();
  await db.setAreaResultsReceived(CIRCLE, '1A', true);
  await db.setAreaResultsReceived(CIRCLE, '2B', true);

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  assert.deepEqual((await db.getAreas(CIRCLE)).map((a) => a.results_received), [false, false]);
  await db.setAreaResultsReceived(CIRCLE, '1A', true);
  assert.deepEqual((await db.getAreas(CIRCLE)).map((a) => a.results_received), [true, false]);
  const kept = await client.query<{ count_year: number; area_code: string }>(
    'SELECT count_year, area_code FROM public.area_results ORDER BY count_year, area_code'
  );
  assert.deepEqual(kept.rows, [
    { count_year: season, area_code: '1A' },
    { count_year: season, area_code: '2B' },
    { count_year: season + 1, area_code: '1A' },
  ]);
});

test('unmarking results in the new season leaves the old season untouched', async () => {
  const { db, client, season } = await dbWithSeason();
  await db.setAreaResultsReceived(CIRCLE, '1A', true);
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });
  await db.setAreaResultsReceived(CIRCLE, '1A', true);

  await db.setAreaResultsReceived(CIRCLE, '1A', false);

  const years = await client.query<{ count_year: number }>('SELECT count_year FROM public.area_results');
  assert.deepEqual(years.rows, [{ count_year: season }]);
});

test('the count date moves to the season that ended and the circle starts with none', async () => {
  const { db, client, season } = await dbWithSeason();
  await db.updateCircleInfo(CIRCLE, { count_date: `12/19/${season}` });

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  assert.equal(
    await scalar(client, 'SELECT count_date::TEXT FROM public.count_years WHERE year = $1', [season]),
    `${season}-12-19`
  );
  assert.equal((await db.getSavedCircles())[0].count_date, null);
});

test('a saved count date outside the season window is dropped without failing the rollover', async () => {
  const { season: thisSeason } = await dbWithSeason();
  const savedBeforeTheWindowRule = [
    'next Saturday',
    `${thisSeason}-02-31`,
    `12/32/${thisSeason}`,
    `${thisSeason}-12-13`,
    `${thisSeason + 1}-01-06`,
  ];
  for (const text of savedBeforeTheWindowRule) {
    const { db, client, season } = await dbWithSeason();
    await client.query('UPDATE public.saved_circles SET count_date = $1', [text]);

    await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

    assert.equal(await scalar(client, 'SELECT count_date FROM public.count_years WHERE year = $1', [season]), null);
    assert.equal((await db.getSavedCircles())[0].current_year, season + 1);
  }
});

test('imports after a rollover land in the new season', async () => {
  const { db, season } = await dbWithSeason();
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  await load(db, [{ full_name: 'Ada', email: 'ada@example.com', rsvp_status: 'confirmed', area_code: '1A' }]);

  assert.equal((await participationsFor(db, season + 1))?.assigned_area_code, '1A');
  assert.equal(await participationsFor(db, season), undefined);
});

test('a rollover to the current or an earlier year is refused and changes nothing', async () => {
  const { db, client, season } = await dbWithSeason();

  for (const year of [season, season - 1]) {
    await assert.rejects(
      db.rolloverSeason(CIRCLE, year, { carryAssignments: true }),
      (err) =>
        err instanceof SeasonRolloverError &&
        err.currentYear === season &&
        err.requestedYear === year &&
        err.circleCode === CIRCLE
    );
  }
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.count_years'), 1);
});

test('a rollover for a circle with no season is refused', async () => {
  const { db } = await openTestDb();

  await assert.rejects(
    db.rolloverSeason('NONE', 2030, { carryAssignments: false }),
    (err) => err instanceof SeasonRolloverError && err.currentYear === null
  );
});
