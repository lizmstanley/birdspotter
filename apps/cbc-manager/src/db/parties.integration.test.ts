import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { NoCurrentSeasonError } from './errors.ts';
import { openTestDb, scalar } from './testing/testDb.ts';
import type { Party } from './types.ts';

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
  await ctx.db.setAreaCounted(CIRCLE, '1A', true);
  await ctx.db.setAreaCounted(CIRCLE, '2B', true);
  return ctx;
}

function party(partyId: string, areaCode: string, startIso: string, changes: Partial<Party> = {}): Party {
  const startTime = Date.parse(startIso);
  return {
    party_id: partyId,
    area_code: areaCode,
    start_time: startTime,
    stop_time: startTime + 6 * 60 * 60 * 1000,
    participants: 2,
    car_hours: 3.25,
    foot_hours: 2.5,
    feeder_hours: 0,
    car_miles: 30.1,
    foot_miles: 1.75,
    ...changes,
  };
}

test('area totals sum the parties of each area', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));
  await db.saveParty(CIRCLE, party('b', '1A', '2026-12-19T08:00:00Z', { participants: 3, feeder_hours: 1.5, foot_miles: 0.3 }));
  await db.saveParty(CIRCLE, party('c', '2B', '2026-12-19T09:00:00Z', { participants: 1 }));

  assert.deepEqual(await db.getCurrentPartyTotals(CIRCLE), [
    { area: '1A', parties: 2, participants: 5, car_hours: 6.5, foot_hours: 5, feeder_hours: 1.5, car_miles: 60.2, foot_miles: 2.05 },
    { area: '2B', parties: 1, participants: 1, car_hours: 3.25, foot_hours: 2.5, feeder_hours: 0, car_miles: 30.1, foot_miles: 1.75 },
  ]);
});

test('parties are listed by area and then by start time', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('late', '1A', '2026-12-19T10:00:00Z'));
  await db.saveParty(CIRCLE, party('other-area', '2B', '2026-12-19T06:00:00Z'));
  await db.saveParty(CIRCLE, party('early', '1A', '2026-12-19T07:00:00Z'));

  const ids = (await db.getCurrentParties(CIRCLE)).map((p) => p.party_id);

  assert.deepEqual(ids, ['early', 'late', 'other-area']);
});

test('saving a party with the same ID replaces it', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));

  await db.saveParty(CIRCLE, party('a', '2B', '2026-12-19T07:00:00Z', { participants: 4 }));

  const saved = await db.getCurrentParties(CIRCLE);
  assert.deepEqual(
    saved.map((p) => [p.party_id, p.area_code, p.participants]),
    [['a', '2B', 4]]
  );
});

test('a party saved under an area code in another case joins that area', async () => {
  const { db, client } = await dbWithCircle();
  await db.setAreaCounted(CIRCLE, 'North', true);

  await db.saveParty(CIRCLE, party('a', 'NORTH', '2026-12-19T07:00:00Z'));

  assert.deepEqual((await db.getCurrentParties(CIRCLE)).map((p) => p.area_code), ['North']);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.areas WHERE circle_code = $1`, [CIRCLE]), 3);
});

test('a new season starts with no parties and the old season keeps its own', async () => {
  const { db, client } = await dbWithCircle();
  const season = await scalar<number>(client, `SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current`, [CIRCLE]);
  await db.saveParty(CIRCLE, party('old', '1A', '2026-12-19T07:00:00Z'));

  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });
  await db.deleteParty(CIRCLE, 'old');

  assert.deepEqual(await db.getCurrentParties(CIRCLE), []);
  assert.deepEqual(await db.getCurrentPartyTotals(CIRCLE), []);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.parties WHERE count_year = $1`, [season]), 1);
});

test('removing a party leaves the area other parties', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));
  await db.saveParty(CIRCLE, party('b', '1A', '2026-12-19T08:00:00Z'));

  await db.deleteParty(CIRCLE, 'a');

  assert.deepEqual((await db.getCurrentParties(CIRCLE)).map((p) => p.party_id), ['b']);
});

test('removing an area removes its parties', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));
  await db.saveParty(CIRCLE, party('b', '2B', '2026-12-19T08:00:00Z'));

  await db.deleteArea(CIRCLE, '1A');

  assert.deepEqual((await db.getCurrentParties(CIRCLE)).map((p) => p.party_id), ['b']);
});

test('a party that stops before it starts is refused', async () => {
  const { db } = await dbWithCircle();
  const start = Date.parse('2026-12-19T07:00:00Z');

  await assert.rejects(db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z', { stop_time: start - 1 })));
  assert.deepEqual(await db.getCurrentParties(CIRCLE), []);
});

test('a circle with no current season cannot take a party, and no area is added', async () => {
  const { db, client } = await dbWithCircle();
  await client.query('UPDATE public.count_years SET is_current = FALSE WHERE circle_code = $1', [CIRCLE]);

  await assert.rejects(db.saveParty(CIRCLE, party('a', '3C', '2026-12-19T07:00:00Z')), NoCurrentSeasonError);
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.areas WHERE code = '3C'`), 0);
});

async function currentSeason(client: PGlite): Promise<number> {
  return scalar<number>(client, `SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current`, [CIRCLE]);
}

test('a circle lists its seasons newest first', async () => {
  const { db, client } = await dbWithCircle();
  const season = await currentSeason(client);
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  assert.deepEqual(await db.getSeasons(CIRCLE), [season + 1, season]);
});

test('a party saved in an earlier season stays out of the current season', async () => {
  const { db, client } = await dbWithCircle();
  const season = await currentSeason(client);
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  await db.savePartyInSeason(CIRCLE, season, party('a', '1A', '2026-12-19T07:00:00Z'));

  assert.deepEqual(await db.getCurrentParties(CIRCLE), []);
  assert.equal((await db.findParty(CIRCLE, 'a'))?.count_year, season);
});

test('saving a party in another season moves it there instead of adding it twice', async () => {
  const { db, client } = await dbWithCircle();
  const season = await currentSeason(client);
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));
  await db.rolloverSeason(CIRCLE, season + 1, { carryAssignments: false });

  await db.savePartyInSeason(CIRCLE, season + 1, party('a', '2B', '2026-12-19T07:00:00Z', { participants: 4 }));

  assert.deepEqual(
    (await db.getCurrentParties(CIRCLE)).map((p) => [p.party_id, p.area_code, p.participants]),
    [['a', '2B', 4]]
  );
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.parties WHERE party_id = 'a'`), 1);
});

test('a party for a season the circle does not have is refused and the saved party stays', async () => {
  const { db, client } = await dbWithCircle();
  const season = await currentSeason(client);
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));

  await assert.rejects(db.savePartyInSeason(CIRCLE, season + 5, party('a', '1A', '2026-12-19T07:00:00Z')));
  assert.equal((await db.findParty(CIRCLE, 'a'))?.count_year, season);
});

test('a pasted party for an area the circle does not have is refused, and no area is added', async () => {
  const { db, client } = await dbWithCircle();
  const season = await currentSeason(client);

  await assert.rejects(db.savePartyInSeason(CIRCLE, season, party('a', '9Z', '2026-12-19T07:00:00Z')));
  assert.equal(await scalar(client, `SELECT COUNT(*)::INT FROM public.areas WHERE code = '9Z'`), 0);
});

test('a party ID is found only in its own circle', async () => {
  const { db } = await dbWithCircle();
  await db.saveParty(CIRCLE, party('a', '1A', '2026-12-19T07:00:00Z'));

  assert.equal(await db.findParty('MNBL', 'a'), null);
});
