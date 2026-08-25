// Everything the payment endpoints share: whether Stripe is configured at all, what the two things
// cost, and how a paid session turns into something this device can prove later.
//
// The guiding constraint is that the site is already live with a prototype checkout. Nothing here
// may break that: with no STRIPE_SECRET_KEY set, every endpoint reports `configured:false` and the
// app keeps its old behaviour. Payments switch on when the key appears, not when this deploys.
import crypto from 'crypto';

export const TIERS = {
  personal: { label: 'NUMIO — Personal Reading', amount: 888,  blurb: 'One complete personal profile, yours to keep.' },
  family:   { label: 'NUMIO — Family Reading',   amount: 2800, blurb: 'Your whole household and their timing, unlimited profiles and comparisons.' },
};
export const CURRENCY = 'gbp';

export function configured() { return !!process.env.STRIPE_SECRET_KEY; }

export async function stripeClient() {
  const { default: Stripe } = await import('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// The app has no accounts, so "has this person paid" cannot be answered by a login. What it can do
// is hold a receipt the server signed: an unforgeable statement that a specific Stripe session was
// paid for a specific tier. A flag in localStorage can be flipped by anyone; this cannot be minted
// without the secret.
//
// Being straight about the limit: the reading is rendered on the device, so someone determined
// enough to read the bundle can still read the content. This stops casual flag-flipping and gives
// support a real record to check — it is not DRM, and it is not pretending to be.
function signingKey() {
  const base = process.env.ENTITLEMENT_SECRET || process.env.STRIPE_SECRET_KEY || '';
  if (!base) return null;
  // A separate key from the Stripe secret even when derived from it, so a receipt signature can
  // never be replayed anywhere Stripe's own key is expected.
  return crypto.createHmac('sha256', base).update('numio:entitlement:v1').digest();
}

export function signReceipt(tier, sessionId) {
  const key = signingKey();
  if (!key) return null;
  const body = `${tier}.${sessionId}`;
  const mac = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyReceipt(token) {
  const key = signingKey();
  if (!key || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i), mac = token.slice(i + 1);
  const want = crypto.createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const dot = body.indexOf('.');
  const tier = body.slice(0, dot);
  return TIERS[tier] ? { tier, sessionId: body.slice(dot + 1) } : null;
}

// Where Stripe sends people back to. Derived from the request so it is right on the live domain, on
// a preview deployment and on localhost, rather than hard-coded to one of them.
export function originOf(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}
