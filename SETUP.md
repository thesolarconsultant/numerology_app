# NUMIO backend — setup

This adds a small backend to NUMIO. Two things go to the server: an anonymous
count every time someone finishes a reading (no name, no date of birth, no
cookie), and — only if that person ticks the box — their calculated profile, so
you can see the patterns across everyone in the dashboard at `/admin.html`.
Nothing is linked to an email, phone number or payment record. `privacy.html`
is the public version of the same description.

There is no migration step. The API carries its own schema and creates the
tables the first time it needs one, so a fresh database sets itself up.

Two things need doing once, in the Vercel dashboard.

## 1. Connect a database

1. Open the project on [vercel.com](https://vercel.com).
2. **Storage** → **Create Database**, and pick any Postgres (Neon, Prisma
   Postgres and Supabase all work — the code uses the standard Postgres
   protocol, not a vendor SDK).
3. Connect it to the project. That sets `POSTGRES_URL` or `DATABASE_URL`
   automatically; either name is picked up, and nothing needs copying by hand.
4. Redeploy so the new variable reaches the running functions.

If your provider offers both a direct connection string and a proxied one
(Prisma's `prisma+postgres://` accelerate URL, for example), use the direct
`postgres://` one. `/api/health` will tell you if you picked the wrong one.

## 2. Set an admin token

This protects `/admin.html` and the `/api/archetypes` endpoint so only you can
see the aggregated data.

1. In the Vercel dashboard: **Settings** → **Environment Variables**.
2. Add a variable named `ADMIN_TOKEN` with a long random value (a password
   manager's "generate password" is ideal — 30+ characters, not digits).
3. Redeploy the project so the new variable takes effect.

Treat it like a password: anyone holding it can read the whole dashboard. If it
has ever been pasted into a chat, an email or a screenshot, change it here and
redeploy — that is all it takes to invalidate the old one.

## Checking it worked

Open `yourdomain.com/api/health`. It answers in plain JSON and holds no data:

- `{"ok":true,"database":"ready"}` — connected, tables in place, nothing to do.
- `{"database":"unconfigured"}` — no database URL reached the deployment. Go
  back to step 1, and check you redeployed afterwards.
- `{"database":"error","detail":"…"}` — the database itself said no. The detail
  is its own message, e.g. a wrong password or the accelerate URL above.

## Using it

- Visit `yourdomain.com/admin.html`, enter the `ADMIN_TOKEN` value you set,
  and you'll see the live breakdown.
- `/api/migrate` (POST, same token) forces the schema to be applied. You should
  not need it — the API does this itself — but it exists, and it is safe to run
  more than once.
- The token is only kept in the browser's session storage on your own device
  — it's never written into the app's source or committed to git.

## What actually gets stored, and what doesn't

- **Stored, per person who opts in:** their full name, date of birth, and
  every number NUMIO calculates from those (Life Path, Expression, Soul
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
