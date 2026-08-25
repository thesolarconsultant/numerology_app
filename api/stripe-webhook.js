// POST /api/stripe-webhook — Stripe telling us what actually happened.
//
// This is the source of truth for a sale, not the browser. It arrives whether or not the person
// ever comes back to the site — closed the tab, lost signal, paid on a train — so a purchase is
// recorded either way. Every event is signature-checked; an unverified body is just a stranger
// posting JSON.
import { configured, stripeClient } from './_pay.js';
import { sql, withSchema } from './_db.js';

// Stripe signs the exact bytes it sent. Vercel would otherwise parse the JSON and hand over a
// re-serialised object, whose bytes no longer match the signature.
export const config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!configured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ configured: false });
  }

  let event;
  try {
    const stripe = await stripeClient();
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    // 400 on purpose: Stripe reads this as "do not retry, the request was wrong", which is true.
    console.error('webhook signature rejected:', e.message);
    return res.status(400).json({ error: 'signature' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status === 'paid') {
      try {
        await withSchema(() => sql`
          INSERT INTO purchases (session_id, tier, amount_total, currency, promo_code, livemode)
          VALUES (${s.id}, ${(s.metadata && s.metadata.tier) || 'personal'}, ${s.amount_total}, ${s.currency},
                  ${(s.total_details && s.total_details.amount_discount) ? 'discounted' : null}, ${!!s.livemode})
          ON CONFLICT (session_id) DO NOTHING
        `);
      } catch (e) {
        // A 500 makes Stripe retry, which is what we want if the database was the problem.
        console.error('webhook could not record purchase:', e.code || '', e.message);
        return res.status(500).json({ error: 'record failed' });
      }
    }
  }
  // Everything else is acknowledged rather than argued with; unknown event types are not errors.
  return res.status(200).json({ received: true });
}
