// POST /api/migrate — applies the schema on demand.
//
// You should not normally need this. The API creates its own tables the first time it needs one
// (see api/_db.js), so a fresh database sets itself up on the first real event. This endpoint
// exists for the case where you want to force it and see exactly what happened, and it is
// authorised with the same ADMIN_TOKEN that guards the dashboard.
//
// Safe to run more than once: every statement is IF NOT EXISTS.
import crypto from 'crypto';
import { applySchema, connectionString } from './_db.js';

function tokenMatches(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const provided = (req.query && req.query.token) || req.headers['x-admin-token'];
  if (!tokenMatches(provided, process.env.ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!connectionString()) {
    return res.status(500).json({ error: 'No database URL is set on this deployment' });
  }

  try {
    const { applied, skipped } = await applySchema();
    return res.status(200).json({ ok: true, applied: applied.length, statements: applied, skipped });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
