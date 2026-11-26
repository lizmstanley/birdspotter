import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb } from './testing/testDb.ts';

const CIRCLE = 'INBL';

async function circleDb() {
  const ctx = await openTestDb();
  await ctx.db.upsertFavoriteCircle({ code: CIRCLE, name: 'Bloomington', center_lat: 39.1, center_lng: -86.5, setActive: true });
  return ctx;
}

async function noteOf(db: Awaited<ReturnType<typeof circleDb>>['db'], code: string) {
  return (await db.getAreas(CIRCLE)).find((a) => a.code === code)?.counter_note;
}

test('saving a note for an area with no row adds the area with the note, trimmed', async () => {
  const { db } = await circleDb();
  await db.setAreaCounterNote(CIRCLE, '3C', '  Meet at the library.\nPark in back.\n ');
  assert.equal(await noteOf(db, '3C'), 'Meet at the library.\nPark in back.');
});

test('saving a blank note clears it', async () => {
  const { db } = await circleDb();
  await db.setAreaCounterNote(CIRCLE, '3C', 'Meet at the library.');
  await db.setAreaCounterNote(CIRCLE, '3C', ' \n ');
  assert.equal(await noteOf(db, '3C'), null);
});
