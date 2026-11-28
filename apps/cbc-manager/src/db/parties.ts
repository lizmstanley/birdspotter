import type { PGlite } from '@electric-sql/pglite';
import { ensureArea } from './areas.ts';
import { NoCurrentSeasonError } from './errors.ts';
import type { AreaPartyTotals, Party } from './types.ts';

/** @returns the current season's parties, by area and then by start time */
export async function getCurrentParties(db: PGlite, circleCode: string): Promise<Party[]> {
  return (
    await db.query<Party>(
      `SELECT pt.party_id, pt.area_code,
              (EXTRACT(EPOCH FROM pt.start_time) * 1000)::FLOAT8 AS start_time,
              (EXTRACT(EPOCH FROM pt.stop_time) * 1000)::FLOAT8 AS stop_time,
              pt.participants,
              pt.car_hours::FLOAT8 AS car_hours, pt.foot_hours::FLOAT8 AS foot_hours,
              pt.feeder_hours::FLOAT8 AS feeder_hours,
              pt.car_miles::FLOAT8 AS car_miles, pt.foot_miles::FLOAT8 AS foot_miles
       FROM public.parties pt
       JOIN public.count_years cy
         ON cy.circle_code = pt.circle_code AND cy.year = pt.count_year AND cy.is_current
       WHERE pt.circle_code = $1
       ORDER BY pt.area_code, pt.start_time, pt.party_id`,
      [circleCode]
    )
  ).rows;
}

export async function getCurrentPartyTotals(db: PGlite, circleCode: string): Promise<AreaPartyTotals[]> {
  return (
    await db.query<AreaPartyTotals>(
      `SELECT t.area, t.parties, t.participants, t.car_hours, t.foot_hours, t.feeder_hours, t.car_miles, t.foot_miles
       FROM public.v_area_party_totals t
       JOIN public.count_years cy
         ON cy.circle_code = t.circle_code AND cy.year = t.count_year AND cy.is_current
       WHERE t.circle_code = $1
       ORDER BY t.area`,
      [circleCode]
    )
  ).rows;
}

/**
 * Saves the party in the circle's current season, replacing a party with the same ID.
 * The area is matched to the circle's areas ignoring case, and added when the circle has none by that code.
 * @throws NoCurrentSeasonError when the circle has no current season
 */
export async function saveParty(db: PGlite, circleCode: string, party: Party): Promise<void> {
  await db.transaction(async (tx) => {
    const areaCode = await ensureArea(tx, circleCode, party.area_code);
    const saved = await tx.query(
      `INSERT INTO public.parties (
          circle_code, count_year, party_id, area_code, start_time, stop_time, participants,
          car_hours, foot_hours, feeder_hours, car_miles, foot_miles
       )
       SELECT cy.circle_code, cy.year, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), $6,
              $7, $8, $9, $10, $11
       FROM public.count_years cy
       WHERE cy.circle_code = $1 AND cy.is_current
       ON CONFLICT (circle_code, count_year, party_id) DO UPDATE SET
          area_code = EXCLUDED.area_code,
          start_time = EXCLUDED.start_time,
          stop_time = EXCLUDED.stop_time,
          participants = EXCLUDED.participants,
          car_hours = EXCLUDED.car_hours,
          foot_hours = EXCLUDED.foot_hours,
          feeder_hours = EXCLUDED.feeder_hours,
          car_miles = EXCLUDED.car_miles,
          foot_miles = EXCLUDED.foot_miles`,
      [
        circleCode,
        party.party_id,
        areaCode,
        party.start_time,
        party.stop_time,
        party.participants,
        party.car_hours,
        party.foot_hours,
        party.feeder_hours,
        party.car_miles,
        party.foot_miles,
      ]
    );
    if (saved.affectedRows === 0) throw new NoCurrentSeasonError(circleCode);
  });
}

export async function deleteParty(db: PGlite, circleCode: string, partyId: string): Promise<void> {
  await db.query(
    `DELETE FROM public.parties pt
     USING public.count_years cy
     WHERE pt.circle_code = $1 AND pt.party_id = $2
       AND cy.circle_code = pt.circle_code AND cy.year = pt.count_year AND cy.is_current`,
    [circleCode, partyId]
  );
}
