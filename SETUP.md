# Archetypes data centre — setup

This adds a small backend to NumeraFlow: when someone explicitly opts in, their
calculated profile is saved so you can see patterns across your userbase (Life
Path distribution, dominant themes, personal year, age band) in a simple
internal dashboard at `/admin.html`. Nothing here is linked to an email, phone
number, or payment record — it's for understanding your audience, not for
contacting individuals.

Three things need doing once, in your Vercel dashboard, before this goes live.

## 1. Add a Postgres database

1. Open your NumeraFlow project on [vercel.com](https://vercel.com).
2. Go to the **Storage** tab → **Create Database** → **Postgres** (this is
   Vercel's own managed Postgres, built on Neon).
3. Follow the prompts to create it and connect it to this project. Vercel
   automatically adds the `POSTGRES_URL` (and related) environment variables
   to your project — you don't need to copy/paste anything.

## 2. Create the table

Once the database is connected, open its **Query** tab in the Vercel dashboard
(or connect with any Postgres client using the connection string Vercel gives
you) and run everything in `api/schema.sql` from this repo. That creates the
one `profiles` table this feature uses.

## 3. Set an admin token

This protects `/admin.html` and the `/api/archetypes` endpoint so only you can
see the aggregated data.

1. In the Vercel dashboard: **Settings** → **Environment Variables**.
2. Add a new variable named `ADMIN_TOKEN` with any long random value you
   choose (a password manager's "generate password" feature works well).
3. Redeploy the project so the new variable takes effect.

## Using it

- Visit `yourdomain.com/admin.html`, enter the `ADMIN_TOKEN` value you set,
  and you'll see the live breakdown.
- The token is only kept in the browser's session storage on your own device
  — it's never written into the app's source or committed to git.

## What actually gets stored, and what doesn't

- **Stored, per person who opts in:** their full name, date of birth, and
  every number NumeraFlow calculates from those (Life Path, Expression, Soul
  Urge, Personality, Personal Year, dominant themes, core need), plus which
  pricing tier they're on and a rough age band.
- **Never stored:** email, phone number, payment details, or any other
  contact channel — `api/submit-profile.js` actively rejects a request that
  tries to include one.
- **Never synced:** family members. Only the account owner's own profile is
  submitted, even on the Family tier. Family members (who are frequently
  children) never consented themselves, so their data isn't sent server-side
  at all.
- Consent is asked once, in-app, with a clear "share anonymously" / "no
  thanks" choice, and can be turned off again from the dashboard at any time.

## Local development

`npm install` pulls in `@vercel/postgres`. Running `vercel dev` locally will
pick up the same environment variables from your Vercel project (via
`vercel env pull`) if you want to test the API routes before deploying.
