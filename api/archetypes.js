// GET /api/archetypes — returns aggregated counts only (never raw rows, never names or DOBs) for the
// admin dashboard. Protected by a shared secret (ADMIN_TOKEN, set in Vercel env vars — see SETUP.md).
import { sql } from '@vercel/postgres';
import crypto from 'crypto';

function tokenMatches(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const provided = req.query.token || req.headers['x-admin-token'];
  if (!tokenMatches(provided, process.env.ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const [total, byLifePath, byTheme1, byTheme2, byPersonalYear, byAgeBand, byNeed, byTier, recentDaily] =
      await Promise.all([
        sql`SELECT COUNT(*)::int AS n FROM profiles`,
        sql`SELECT life_path_root, COUNT(*)::int AS n FROM profiles WHERE life_path_root IS NOT NULL GROUP BY life_path_root ORDER BY n DESC`,
        sql`SELECT dominant_theme_1 AS theme, COUNT(*)::int AS n FROM profiles WHERE dominant_theme_1 IS NOT NULL GROUP BY dominant_theme_1 ORDER BY n DESC`,
        sql`SELECT dominant_theme_2 AS theme, COUNT(*)::int AS n FROM profiles WHERE dominant_theme_2 IS NOT NULL GROUP BY dominant_theme_2 ORDER BY n DESC`,
        sql`SELECT personal_year, COUNT(*)::int AS n FROM profiles WHERE personal_year IS NOT NULL GROUP BY personal_year ORDER BY personal_year`,
        sql`SELECT age_band, COUNT(*)::int AS n FROM profiles WHERE age_band IS NOT NULL GROUP BY age_band ORDER BY age_band`,
        sql`SELECT core_need, COUNT(*)::int AS n FROM profiles WHERE core_need IS NOT NULL GROUP BY core_need ORDER BY n DESC`,
        sql`SELECT tier, COUNT(*)::int AS n FROM profiles GROUP BY tier`,
        sql`SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS n FROM profiles WHERE created_at > now() - interval '30 days' GROUP BY day ORDER BY day`,
      ]);

    return res.status(200).json({
      total: total.rows[0]?.n || 0,
      byLifePath: byLifePath.rows,
      byTheme1: byTheme1.rows,
      byTheme2: byTheme2.rows,
      byPersonalYear: byPersonalYear.rows,
      byAgeBand: byAgeBand.rows,
      byNeed: byNeed.rows,
      byTier: byTier.rows,
      recentDaily: recentDaily.rows,
    });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
