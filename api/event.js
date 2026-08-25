// POST /api/event — records one anonymous milestone so completion and conversion can be
// counted for everyone, not only for the people who opt in to sharing a profile.
//
// This endpoint holds no personal data by construction. There is no field for a name, a date
// of birth, an email or a device id, and it rejects any request that tries to add one. It does
// not read or store the caller's IP address and sets no cookie.
import { sql, withSchema } from './_db.js';

const NAMES = ['profile_completed', 'reading_opened', 'checkout_started', 'purchase'];
const TIERS = ['personal', 'family'];
const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
// One of three answers, one of which is a refusal — the same shape as an age band, and no more
// identifying than one. Anything not on this list is dropped rather than stored.
const GENDERS = ['man', 'woman', 'prefer-not-to-say'];
const SOURCES = ['app', 'web'];
const ROOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33, 44];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};

  if (!NAMES.includes(b.name)) {
    return res.status(400).json({ error: 'unknown event name' });
  }
  // Defence in depth: nothing identifying gets in here even if a client sends it.
  if (b.fullName || b.name === undefined || b.dob || b.email || b.phone || b.contact || b.id) {
    return res.status(400).json({ error: 'this endpoint does not accept identifying information' });
  }

  const tier = TIERS.includes(b.tier) ? b.tier : null;
  const root = ROOTS.includes(b.lifePathRoot) ? b.lifePathRoot : null;
  const band = AGE_BANDS.includes(b.ageBand) ? b.ageBand : null;
  const source = SOURCES.includes(b.source) ? b.source : null;
  const gender = GENDERS.includes(b.gender) ? b.gender : null;

  try {
    // withSchema creates the tables on the very first event, so there is no migration to run.
    await withSchema(() => sql`
      INSERT INTO events (name, tier, life_path_root, age_band, gender, source)
      VALUES (${b.name}, ${tier}, ${root}, ${band}, ${gender}, ${source})
    `);
    return res.status(204).end();
  } catch (e) {
    // A missed count must never break someone's reading, so this always answers quietly — but it
    // says so in the runtime logs, otherwise a broken database looks exactly like no traffic.
    console.error('event insert failed:', e.code || '', e.message);
    return res.status(204).end();
  }
}
