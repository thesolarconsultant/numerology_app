// POST /api/submit-profile — accepts one person's calculated profile after they've explicitly
// opted in (see the consent UI in index.html). Never accepts an email, phone number, or any other
// contact channel — this endpoint has no field for one and rejects requests that try to add one,
// so it can't accidentally become a direct-marketing contact list.
import { sql } from '@vercel/postgres';

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const TIERS = ['personal', 'family'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};

  if (b.consent !== true) {
    return res.status(400).json({ error: 'consent must be true' });
  }
  if (typeof b.fullName !== 'string' || !b.fullName.trim() || b.fullName.length > 200) {
    return res.status(400).json({ error: 'fullName is required' });
  }
  if (typeof b.dob !== 'string' || !DOB_RE.test(b.dob)) {
    return res.status(400).json({ error: 'dob must be YYYY-MM-DD' });
  }
  if (b.ageBand != null && !AGE_BANDS.includes(b.ageBand)) {
    return res.status(400).json({ error: 'invalid ageBand' });
  }
  if (b.tier != null && !TIERS.includes(b.tier)) {
    return res.status(400).json({ error: 'invalid tier' });
  }
  // Defense in depth: this endpoint stores no contact info, ever, no matter what a client sends.
  if (b.email || b.phone || b.contact) {
    return res.status(400).json({ error: 'this endpoint does not accept contact information' });
  }

  const str = v => (typeof v === 'string' && v.length <= 100 ? v : null);
  const int = v => (Number.isInteger(v) ? v : null);

  try {
    const { rows } = await sql`
      INSERT INTO profiles (
        full_name, dob,
        life_path_display, life_path_root,
        birthday_display, birth_month_display, day_month_display, birth_year_display,
        expression_display, soul_urge_display, personality_display,
        personal_year, dominant_theme_1, dominant_theme_2, core_need,
        age_band, tier, consent
      ) VALUES (
        ${b.fullName.trim().slice(0, 200)}, ${b.dob},
        ${str(b.lifePathDisplay)}, ${int(b.lifePathRoot)},
        ${str(b.birthdayDisplay)}, ${str(b.birthMonthDisplay)}, ${str(b.dayMonthDisplay)}, ${str(b.birthYearDisplay)},
        ${str(b.expressionDisplay)}, ${str(b.soulUrgeDisplay)}, ${str(b.personalityDisplay)},
        ${int(b.personalYear)}, ${str(b.dominantTheme1)}, ${str(b.dominantTheme2)}, ${str(b.coreNeed)},
        ${b.ageBand || null}, ${b.tier || 'personal'}, true
      )
      RETURNING id, delete_token
    `;
    const row = rows[0];
    return res.status(200).json({ ok: true, id: row.id, deleteToken: row.delete_token });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
