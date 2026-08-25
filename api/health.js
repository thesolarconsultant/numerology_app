// GET /api/health — is the backend actually wired up?
//
// Answers three questions and nothing else: is a database configured on this deployment, can it be
// reached, and do the two tables exist. It returns no rows, no counts and no secrets, so it is safe
// to leave open — it tells a stranger nothing they could not learn by using the app normally.
//
// If the tables are missing it creates them, which is the same thing the first real event would do
// anyway. That makes this the one URL to open after wiring up a new database.
import { connectionString, ensureSchema, schemaState } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!connectionString()) {
    return res.status(200).json({
      ok: false,
      database: 'unconfigured',
      detail: 'No database URL on this deployment (looked for POSTGRES_URL and DATABASE_URL). ' +
              'Connect a database to the Vercel project, then redeploy.',
    });
  }

  try {
    let tables = await schemaState();
    let created = false;
    if (!tables.profiles || !tables.events) {
      await ensureSchema();
      tables = await schemaState();
      created = true;
    }
    const ready = tables.profiles && tables.events;
    return res.status(ready ? 200 : 500).json({
      ok: ready,
      database: ready ? 'ready' : 'incomplete',
      tables,
      created,
    });
  } catch (e) {
    // The message is the database's own ("password authentication failed", "could not connect"),
    // which is the whole point of this endpoint — without it a misconfiguration is invisible.
    return res.status(500).json({ ok: false, database: 'error', detail: String(e.message || e) });
  }
}
