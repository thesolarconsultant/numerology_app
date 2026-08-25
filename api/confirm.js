// GET /api/confirm?session_id=… — the person is back from Stripe. Ask Stripe whether that session
// was actually paid, and if it was, hand this device a signed receipt it can keep.
//
// Deliberately asks Stripe rather than trusting the URL: the session id arrives in a query string,
// and a query string is a suggestion.
import { configured, stripeClient, signReceipt, TIERS } from './_pay.js';
import { sql, withSchema } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(200).json({ configured: false });

  const id = (req.query && req.query.session_id) || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'bad session id' });

  try {
    const stripe = await stripeClient();
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.payment_status !== 'paid') return res.status(200).json({ paid: false });

    const tier = TIERS[s.metadata && s.metadata.tier] ? s.metadata.tier : 'personal';

    // Record it here as well as in the webhook. The webhook is the source of truth and arrives
    // whether or not anybody comes back to the site; this covers the ordinary case where they do,
    // and the insert is idempotent so the two cannot double-count.
    try {
      await withSchema(() => sql`
        INSERT INTO purchases (session_id, tier, amount_total, currency, promo_code, livemode)
        VALUES (${s.id}, ${tier}, ${s.amount_total}, ${s.currency},
                ${(s.total_details && s.total_details.amount_discount) ? 'discounted' : null}, ${!!s.livemode})
        ON CONFLICT (session_id) DO NOTHING
      `);
    } catch (e) { console.error('purchase record failed:', e.code || '', e.message); }

    return res.status(200).json({ paid: true, tier, receipt: signReceipt(tier, s.id) });
  } catch (e) {
    console.error('confirm failed:', e.type || '', e.message);
    return res.status(502).json({ error: 'could not check that payment' });
  }
}
