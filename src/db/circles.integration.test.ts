import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CbcDb } from './cbcDb.ts';
import { seasonInPreparation } from '../services/season.ts';
import { CountDateOutsideSeasonError, DatabaseNotOpenError } from './errors.ts';
import { migrations, openMemoryClient, openTestDb, scalar, viewsSql } from './testing/testDb.ts';

const circle = (code: string, name: string, extra = {}) => ({
  code,
  name,
  center_lat: 39.1,
  center_lng: -86.5,
  ...extra,
});

test('adding a circle makes it a favorite and gives it a current season', async () => {
  const { db, client } = await openTestDb();

  await db.upsertFavoriteCircle(circle(' inbl ', ' Bloomington '));

  const [saved] = await db.getSavedCircles();
  assert.deepEqual([saved.code, saved.name, saved.is_favorite], ['INBL', 'Bloomington', true]);
  assert.equal(
    await scalar(client, `SELECT year FROM public.count_years WHERE circle_code = 'INBL' AND is_current`),
    seasonInPreparation(new Date())
  );
});

test('a count date inside the season window is saved as YYYY-MM-DD', async () => {
  const { db } = await openTestDb();
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha'));
  const season = seasonInPreparation(new Date());

  for (const [typed, saved] of [
    [`12/14/${season}`, `${season}-12-14`],
    [`${season + 1}-1-5`, `${season + 1}-01-05`],
  ]) {
    await db.updateCircleInfo('AAAA', { count_date: typed });
    assert.equal((await db.getSavedCircles())[0].count_date, saved);
  }
});

test('a count date outside the season window or not a real day is refused and changes nothing', async () => {
  const { db } = await openTestDb();
  const season = seasonInPreparation(new Date());
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { count_date: `${season}-12-19` }));

  for (const typed of [`${season}-12-13`, `${season + 1}-01-06`, `${season + 1}-12-19`, `${season}-02-31`, 'next Saturday']) {
    await assert.rejects(
      db.updateCircleInfo('AAAA', { count_date: typed }),
      (err) => err instanceof CountDateOutsideSeasonError && err.countDate === typed && err.season === season
    );
  }
  assert.equal((await db.getSavedCircles())[0].count_date, `${season}-12-19`);
});

test('clearing the count date is allowed', async () => {
  const { db } = await openTestDb();
  const season = seasonInPreparation(new Date());
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { count_date: `${season}-12-19` }));

  await db.updateCircleInfo('AAAA', { count_date: '  ' });

  assert.equal((await db.getSavedCircles())[0].count_date, null);
});

test('adding a circle with a count date from another season saves no count date', async () => {
  const { db } = await openTestDb();
  const season = seasonInPreparation(new Date());

  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { count_date: `${season - 1}-12-20` }));

  assert.equal((await db.getSavedCircles())[0].count_date, null);
});

test('only one circle is active at a time', async () => {
  const { db } = await openTestDb();
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { setActive: true }));

  await db.upsertFavoriteCircle(circle('BBBB', 'Beta', { setActive: true }));

  const active = (await db.getSavedCircles()).filter((c) => c.is_active).map((c) => c.code);
  assert.deepEqual(active, ['BBBB']);
});

test('saving a circle again keeps compiler details the new data does not carry', async () => {
  const { db } = await openTestDb();
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { compiler_name: 'Pat', audubon_url: 'https://example.org/a' }));

  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha Renamed'));

  const [saved] = await db.getSavedCircles();
  assert.deepEqual([saved.name, saved.compiler_name, saved.audubon_url], ['Alpha Renamed', 'Pat', 'https://example.org/a']);
});

test('removing the active circle activates another one', async () => {
  const { db } = await openTestDb();
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha'));
  await db.upsertFavoriteCircle(circle('BBBB', 'Beta', { setActive: true }));

  await db.removeFavoriteCircle('BBBB');

  assert.deepEqual((await db.getSavedCircles()).map((c) => [c.code, c.is_active]), [['AAAA', true]]);
});

test('removing a circle deletes its roster and areas', async () => {
  const { db, client } = await openTestDb();
  await db.upsertFavoriteCircle(circle('AAAA', 'Alpha', { setActive: true }));
  await db.importParticipants(
    'AAAA',
    [{ full_name: 'Ada', email: 'ada@example.com', area_code: '1A' }],
    { updateExisting: true, isCurrentList: true, defaultRsvp: 'confirmed' }
  );

  await db.removeFavoriteCircle('AAAA');

  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.people'), 0);
  assert.equal(await scalar(client, 'SELECT COUNT(*)::INT FROM public.areas'), 0);
});

test('using the database before init fails with a clear error', () => {
  const db = new CbcDb(openMemoryClient, migrations, viewsSql);

  assert.throws(() => db.getSavedCircles(), (err) => err instanceof DatabaseNotOpenError);
});
