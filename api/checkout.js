// POST /api/checkout — starts a real Stripe Checkout Session and hands back the URL to send the
// person to. Prices live on the server; a client that asks to pay 1p is asking the wrong machine.
import { TIERS, CURRENCY, configured, stripeClient, originOf } from './_pay.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // The live site still has the prototype checkout behind this. Saying so plainly lets the app keep
  // working until the key is set, instead of failing in front of a customer.
  if (!configured()) return res.status(200).json({ configured: false });

  const b = req.body || {};
  const tier = TIERS[b.tier] ? b.tier : null;
  if (!tier) return res.status(400).json({ error: 'unknown tier' });

  const origin = originOf(req);
  if (!origin) return res.status(500).json({ error: 'could not work out this site\'s address' });

  try {
    const stripe = await stripeClient();
    const t = TIERS[tier];

    // Promo codes. Two paths on purpose:
    //   ?promo=LAUNCH  — an ad or a card can carry the code, and it is applied before they see a
    //                    price, which is the difference between a discount and a rebate.
    //   otherwise      — Stripe's own promo box in Checkout.
    // Stripe will not accept both at once, so a code that resolves wins and anything else falls
    // back to the box rather than silently dropping the discount.
    let discounts, allow_promotion_codes = true;
    const wanted = typeof b.promo === 'string' ? b.promo.trim().toUpperCase() : '';
    if (wanted) {
      const found = await stripe.promotionCodes.list({ code: wanted, active: true, limit: 1 });
      if (found.data.length) { discounts = [{ promotion_code: found.data[0].id }]; allow_promotion_codes = undefined; }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: t.amount,
          product_data: { name: t.label, description: t.blurb },
        },
      }],
      ...(discounts ? { discounts } : { allow_promotion_codes }),
      // Stripe collects the email, so the app never has to hold one.
      customer_creation: 'if_required',
      success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: { tier },
    });
    return res.status(200).json({ configured: true, url: session.url, id: session.id });
  } catch (e) {
    console.error('checkout failed:', e.type || '', e.message);
    return res.status(502).json({ error: 'could not start checkout' });
  }
}
