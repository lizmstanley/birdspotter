import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { AreaBoundaryRow, AreaOption, BoundaryInput } from './types.ts';

export function computeSortOrder(code: string): number {
  const m = code.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) * 10 : 9999;
}

export async function getAreas(db: PGlite, circleCode: string): Promise<AreaOption[]> {
  return (
    await db.query<AreaOption>(
      `SELECT a.code, a.cities, a.notable_spots, a.active_restrictions, a.is_counted,
              EXISTS (
                SELECT 1 FROM public.area_results r
                JOIN public.count_years cy
                  ON cy.circle_code = r.circle_code AND cy.year = r.count_year AND cy.is_current
                WHERE r.circle_code = a.circle_code AND r.area_code = a.code
              ) AS results_received
       FROM public.areas a
       WHERE a.circle_code = $1
       ORDER BY a.sort_order, a.code`,
      [circleCode]
    )
  ).rows;
}

export async function getCircleBoundaries(db: PGlite, circleCode: string): Promise<AreaBoundaryRow[]> {
  return (
    await db.query<AreaBoundaryRow>(
      `SELECT circle_code, area_code AS code, label, geometry_geojson AS boundary_geojson
       FROM public.circle_boundaries
       WHERE circle_code = $1
       ORDER BY sort_order, area_code`,
      [circleCode]
    )
  ).rows;
}

export async function upsertCircleBoundaries(
  db: PGlite,
  circleCode: string,
  boundaries: BoundaryInput[]
): Promise<{ saved: number }> {
  let saved = 0;
  await db.transaction(async (tx) => {
    for (const b of boundaries) {
      const fileAreaCode = b.code.trim();
      if (!fileAreaCode) continue;
      // An outline names an existing area in any case; the outer circle is not an area.
      const areaCode = b.isOuterCircle
        ? fileAreaCode
        : await ensureArea(tx, circleCode, fileAreaCode, b.name || null);
      await tx.query(
        `INSERT INTO public.circle_boundaries (circle_code, area_code, sort_order, label, geometry_geojson)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (circle_code, area_code) DO UPDATE SET
            label = EXCLUDED.label,
            geometry_geojson = EXCLUDED.geometry_geojson`,
        [circleCode, areaCode, computeSortOrder(areaCode), b.name || null, JSON.stringify(b.geometry)]
      );
      saved += 1;
    }
  });
  return { saved };
}

export async function setAreaCounted(db: PGlite, circleCode: string, areaCode: string, isCounted: boolean): Promise<void> {
  await db.query(
    `INSERT INTO public.areas (circle_code, code, sort_order, is_counted)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (circle_code, code) DO UPDATE SET is_counted = EXCLUDED.is_counted`,
    [circleCode, areaCode, computeSortOrder(areaCode), isCounted]
  );
}

export async function setAreaResultsReceived(
  db: PGlite,
  circleCode: string,
  areaCode: string,
  received: boolean
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO public.areas (circle_code, code, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (circle_code, code) DO NOTHING`,
      [circleCode, areaCode, computeSortOrder(areaCode)]
    );
    if (received) {
      await tx.query(
        `INSERT INTO public.area_results (circle_code, count_year, area_code)
         SELECT circle_code, year, $2 FROM public.count_years WHERE circle_code = $1 AND is_current
         ON CONFLICT DO NOTHING`,
        [circleCode, areaCode]
      );
      return;
    }
    await tx.query(
      `DELETE FROM public.area_results r
       USING public.count_years cy
       WHERE r.circle_code = $1 AND r.area_code = $2
         AND cy.circle_code = r.circle_code AND cy.year = r.count_year AND cy.is_current`,
      [circleCode, areaCode]
    );
  });
}

export async function deleteArea(db: PGlite, circleCode: string, areaCode: string): Promise<void> {
  await db.query(
    'DELETE FROM public.areas WHERE circle_code = $1 AND code = $2',
    [circleCode, areaCode]
  );
}

export async function clearCircleBoundaries(db: PGlite, circleCode: string): Promise<void> {
  await db.query('DELETE FROM public.circle_boundaries WHERE circle_code = $1', [circleCode]);
}

export async function ensureArea(
  tx: Transaction,
  circleCode: string,
  code: string,
  notableSpots: string | null = null
): Promise<string> {
  const existing = await tx.query<{ code: string }>(
    `SELECT code FROM public.areas
     WHERE circle_code = $1 AND UPPER(code) = UPPER($2)
     ORDER BY code
     LIMIT 1`,
    [circleCode, code]
  );
  if (existing.rows[0]) return existing.rows[0].code;
  await tx.query(
    'INSERT INTO public.areas (circle_code, code, sort_order, notable_spots) VALUES ($1, $2, $3, $4)',
    [circleCode, code, computeSortOrder(code), notableSpots]
  );
  return code;
}
