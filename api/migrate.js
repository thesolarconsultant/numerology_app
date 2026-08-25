// POST /api/migrate — creates the tables this app needs, once.
//
// Prisma Postgres has no SQL console to paste a schema into, and a connection string is a live
// credential that should never leave the Vercel project. So the app applies its own schema:
// authorise with the same ADMIN_TOKEN that guards the dashboard, and it runs api/schema.sql.
//
// Safe to run more than once. Every statement in that file is IF NOT EXISTS, which is verified —
// running the whole schema twice produces "already exists, skipping" notices and no errors.
import { createClient } from '@vercel/postgres';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

function tokenMatches(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Strip -- comments, then split on the semicolons that are left. The schema contains no string
// literals or function bodies, so there are no semicolons that need protecting from the split.
export function statementsFrom(sqlText) {
  return sqlText
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
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
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: 'POSTGRES_URL is not set on this deployment' });
  }

  const file = path.join(process.cwd(), 'api', 'schema.sql');
  let statements;
  try {
    statements = statementsFrom(await readFile(file, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'could not read api/schema.sql' });
  }

  const client = createClient();
  const applied = [];
  const skipped = [];
  try {
    await client.connect();
    for (const stmt of statements) {
      const label = stmt.split('\n')[0].slice(0, 60);
      try {
        await client.query(stmt);
        applied.push(label);
      } catch (e) {
        // CREATE EXTENSION can be refused on managed hosts. gen_random_uuid() is native to
        // Postgres 13+, so the schema is fine without it — record and carry on.
        if (/extension/i.test(stmt)) { skipped.push(label + ' — ' + e.message); continue; }
        throw e;
      }
    }
    return res.status(200).json({ ok: true, applied: applied.length, statements: applied, skipped });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), applied: applied.length, skipped });
  } finally {
    try { await client.end(); } catch (e) {}
  }
}
