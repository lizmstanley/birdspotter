import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CbcDb } from './cbcDb.ts';
import { DatabaseNotOpenError } from './errors.ts';
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
    new Date().getFullYear()
  );
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
