import type { PGlite } from '@electric-sql/pglite';
import type { CircleInfoInput, CircleInput, SavedCircle } from './types.ts';

export async function getSavedCircles(db: PGlite): Promise<SavedCircle[]> {
  const res = await db.query<SavedCircle>(
    `SELECT code, name, state_province, center_lat, center_lng, radius_miles, is_favorite, is_active,
            compiler_name, compiler_email, count_date, audubon_url
     FROM public.saved_circles
     ORDER BY is_active DESC, name ASC`
  );
  return res.rows;
}

export async function upsertFavoriteCircle(db: PGlite, circle: CircleInput): Promise<void> {
  const code = circle.code.trim().toUpperCase();
  const currentYear = new Date().getFullYear();

  await db.transaction(async (tx) => {
    if (circle.setActive) {
      await tx.query('UPDATE public.saved_circles SET is_active = FALSE WHERE is_active = TRUE');
    }
    await tx.query(
      `INSERT INTO public.saved_circles (
          code, name, state_province, center_lat, center_lng, radius_miles, is_favorite, is_active,
          compiler_name, compiler_email, count_date, audubon_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10, $11)
       ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          state_province = COALESCE(EXCLUDED.state_province, public.saved_circles.state_province),
          center_lat = EXCLUDED.center_lat,
          center_lng = EXCLUDED.center_lng,
          compiler_name = COALESCE(EXCLUDED.compiler_name, public.saved_circles.compiler_name),
          compiler_email = COALESCE(EXCLUDED.compiler_email, public.saved_circles.compiler_email),
          count_date = COALESCE(EXCLUDED.count_date, public.saved_circles.count_date),
          audubon_url = COALESCE(EXCLUDED.audubon_url, public.saved_circles.audubon_url),
          is_favorite = TRUE,
          is_active = CASE WHEN $7 THEN TRUE ELSE public.saved_circles.is_active END`,
      [
        code,
        circle.name.trim(),
        circle.state_province ?? null,
        circle.center_lat,
        circle.center_lng,
        circle.radius_miles ?? 7.5,
        Boolean(circle.setActive),
        circle.compiler_name ?? null,
        circle.compiler_email ?? null,
        circle.count_date ?? null,
        circle.audubon_url ?? null,
      ]
    );

    // Ensure the circle has an active count_year row so views work immediately
    await tx.query(
      `INSERT INTO public.count_years (circle_code, year, is_current)
       SELECT $1, $2, TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM public.count_years WHERE circle_code = $1 AND is_current = TRUE
       )
       ON CONFLICT (circle_code, year) DO NOTHING`,
      [code, currentYear]
    );
  });
}

export async function setActiveCircle(db: PGlite, code: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('UPDATE public.saved_circles SET is_active = FALSE WHERE is_active = TRUE');
    await tx.query('UPDATE public.saved_circles SET is_active = TRUE WHERE code = $1', [code]);
  });
}

export async function removeFavoriteCircle(db: PGlite, code: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM public.saved_circles WHERE code = $1', [code]);
    const active = await tx.query<{ code: string }>(
      'SELECT code FROM public.saved_circles WHERE is_active = TRUE LIMIT 1'
    );
    if (active.rows.length === 0) {
      await tx.query(
        `UPDATE public.saved_circles
         SET is_active = TRUE
         WHERE code = (SELECT code FROM public.saved_circles ORDER BY name ASC LIMIT 1)`
      );
    }
  });
}

export async function updateActiveCircleCenter(db: PGlite, code: string, lat: number, lng: number): Promise<void> {
  await db.query(
    'UPDATE public.saved_circles SET center_lat = $1, center_lng = $2 WHERE code = $3',
    [lat, lng, code]
  );
}

export async function renameCircle(db: PGlite, code: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  await db.query(
    'UPDATE public.saved_circles SET name = $1 WHERE code = $2',
    [trimmed, code]
  );
}

export async function updateCircleInfo(
  db: PGlite,
  code: string,
  info: CircleInfoInput
): Promise<void> {
  await db.query(
    `UPDATE public.saved_circles
     SET compiler_name = $1,
         compiler_email = $2,
         count_date = $3,
         audubon_url = $4
     WHERE code = $5`,
    [
      info.compiler_name?.trim() || null,
      info.compiler_email?.trim() || null,
      info.count_date?.trim() || null,
      info.audubon_url?.trim() || null,
      code,
    ]
  );
}
