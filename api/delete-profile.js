// POST /api/delete-profile — erases one shared profile.
//
// Consent that cannot be withdrawn is not consent, so the opt-in in the app has to have a
// working way back out. Deletion is authorised by the row's own delete_token, a random secret
// handed to that person when they opted in: it means someone can erase their own row without
// an account, and cannot guess anyone else's.
import { sql } from '@vercel/postgres';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id is required' });
  }
  if (typeof b.deleteToken !== 'string' || !UUID_RE.test(b.deleteToken)) {
    return res.status(400).json({ error: 'deleteToken is required' });
  }

  try {
    const { rowCount } = await sql`
      DELETE FROM profiles WHERE id = ${id} AND delete_token = ${b.deleteToken}
    `;
    // Answer the same either way: a wrong token must not reveal whether the row exists.
    return res.status(200).json({ ok: true, deleted: rowCount });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
