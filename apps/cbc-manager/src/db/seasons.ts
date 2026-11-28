import type { PGlite } from '@electric-sql/pglite';
import { countDateInSeason } from '../services/countDay.ts';
import { seasonInPreparation } from '../services/season.ts';
import { SeasonRolloverError } from './errors.ts';
import type { Queryable } from './queryable.ts';
import type { RolloverOptions } from './types.ts';

/** @returns the circle's current season, or the season in preparation when it has none yet */
export async function currentSeasonOf(db: Queryable, circleCode: string): Promise<number> {
  const res = await db.query<{ year: number }>(
    'SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current',
    [circleCode]
  );
  return res.rows[0]?.year ?? seasonInPreparation(new Date());
}

/** @returns the circle's seasons, newest first */
export async function getSeasons(db: Queryable, circleCode: string): Promise<number[]> {
  const res = await db.query<{ year: number }>(
    'SELECT year FROM public.count_years WHERE circle_code = $1 ORDER BY year DESC',
    [circleCode]
  );
  return res.rows.map((row) => row.year);
}

/**
 * Makes `newYear` the circle's current season. People, areas, and pinned notes stay.
 * Results received start empty for the new season. The old season keeps its records.
 * @throws SeasonRolloverError when the circle has no current season or `newYear` is not after it
 */
export async function rolloverSeason(
  db: PGlite,
  circleCode: string,
  newYear: number,
  options: RolloverOptions
): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await tx.query<{ year: number }>(
      'SELECT year FROM public.count_years WHERE circle_code = $1 AND is_current',
      [circleCode]
    );
    const oldYear = current.rows[0]?.year;
    if (oldYear === undefined || newYear <= oldYear) {
      throw new SeasonRolloverError(circleCode, oldYear ?? null, newYear);
    }

    // The saved date belongs to the season that ends; Audubon sets a new one each year.
    const circle = await tx.query<{ count_date: string | null }>(
      'SELECT count_date FROM public.saved_circles WHERE code = $1',
      [circleCode]
    );
    await tx.query(
      `UPDATE public.count_years
       SET count_date = COALESCE(count_date, $3::DATE)
       WHERE circle_code = $1 AND year = $2`,
      [circleCode, oldYear, countDateInSeason(circle.rows[0]?.count_date, oldYear)]
    );
    await tx.query('UPDATE public.saved_circles SET count_date = NULL WHERE code = $1', [circleCode]);

    await tx.query('UPDATE public.count_years SET is_current = FALSE WHERE circle_code = $1 AND year = $2', [
      circleCode,
      oldYear,
    ]);
    await tx.query(
      `INSERT INTO public.count_years (circle_code, year, is_current) VALUES ($1, $2, TRUE)
       ON CONFLICT (circle_code, year) DO UPDATE SET is_current = TRUE`,
      [circleCode, newYear]
    );

    if (!options.carryAssignments) return;
    await tx.query(
      `INSERT INTO public.participations (
          circle_code, count_year, person_id, rsvp_status, counter_type, assigned_area_code, is_area_leader
       )
       SELECT p.circle_code, $3, p.person_id, 'no_response', p.counter_type, p.assigned_area_code, p.is_area_leader
       FROM public.participations p
       JOIN public.people pe ON pe.id = p.person_id
       WHERE p.circle_code = $1 AND p.count_year = $2
         AND p.assigned_area_code IS NOT NULL
         AND p.rsvp_status IN ('confirmed', 'undecided')
         AND pe.roster_status = 'active'
       ON CONFLICT (circle_code, count_year, person_id) DO NOTHING`,
      [circleCode, oldYear, newYear]
    );
  });
}
