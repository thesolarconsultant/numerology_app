// The database schema, the connection, and the code that makes sure the schema exists.
//
// Prisma Postgres gives you no SQL console to paste a schema into, and a connection string is a
// live credential that should never be copied around by hand. So the app carries its own schema
// and applies it the first time it needs a table that isn't there yet. There is no migration step
// to remember and nothing to run: the first person who finishes a reading creates the tables.
//
// The SQL lives here as a string rather than in a .sql file on purpose. Vercel bundles a
// serverless function from the imports it can see, so a file read at run time can be left out of
// the bundle and fail with ENOENT in production. An imported string is always there.
//
// The driver is node-postgres rather than @vercel/postgres. Two reasons, both learned the hard
// way. @vercel/postgres is deprecated by Vercel. And it ships separate ESM and CommonJS builds:
// Vercel compiles these handlers from ESM to CommonJS, so the bundler traced the ESM build while
// the running function required the CommonJS one, which meant every API route died with
// "Cannot find module .../dist/index-node.cjs". node-postgres has one entry point, so what gets
// traced is what gets required, whichever way the handler is compiled.
import pg from 'pg';

// Whichever name the database provider used. Vercel's own integrations set POSTGRES_URL; Prisma
// and most others set DATABASE_URL.
export function connectionString() {
  return process.env.POSTGRES_URL
      || process.env.DATABASE_URL
      || process.env.POSTGRES_PRISMA_URL
      || process.env.POSTGRES_URL_NON_POOLING
      || '';
}

// TLS. Worth being precise about, because two things decide it and only one of them is this
// function: node-postgres merges the connection string's own parsed options *over* the ones passed
// in, so whenever the URL carries an sslmode that is what actually applies. In pg 8 an sslmode of
// require, prefer or verify-ca is treated as verify-full — the certificate is properly verified —
// which is what the live database does today, and pg warns that a future major version will
// downgrade those to unverified. The dependency is pinned to ^8 so that cannot arrive unnoticed.
//
// This function therefore decides the case the URL leaves open: no sslmode at all. Remote gets
// encryption without verification, because managed providers all require TLS and many present
// certificates that will not verify against the public roots; local gets none.
function sslFor(cs) {
  const mode = (/[?&]sslmode=([^&]+)/i.exec(cs) || [])[1];
  if (mode === 'disable') return false;
  if (mode) return { rejectUnauthorized: true };
  return /@(localhost|127\.0\.0\.1|\[::1\])/i.test(cs) ? false : { rejectUnauthorized: false };
}

// One pool per warm instance. A serverless instance handles one request at a time, so this stays
// small on purpose; the dashboard's dozen parallel aggregates just queue behind each other.
let pool = null;
export function getPool() {
  if (pool) return pool;
  const cs = connectionString();
  if (!cs) {
    throw new Error('No database URL is set on this deployment (looked for POSTGRES_URL and DATABASE_URL).');
  }
  if (/^prisma\+postgres:/i.test(cs)) {
    throw new Error(
      'The database URL is a prisma+postgres:// accelerate URL, which is not a Postgres wire ' +
      'connection. Use the direct postgres:// connection string for this database instead.'
    );
  }
  pool = new pg.Pool({
    connectionString: cs,
    ssl: sslFor(cs),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  // An idle client dropped by the provider must not take the whole instance down with it.
  pool.on('error', () => {});
  return pool;
}

// A tagged template, so every value in a query is a bound parameter and nothing is ever
// concatenated into SQL:  sql`SELECT * FROM t WHERE id = ${id}`  ->  ('SELECT ... $1', [id])
export function sql(strings, ...values) {
  let text = '';
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += '$' + (i + 1);
  }
  return getPool().query(text, values);
}

// Every statement is IF NOT EXISTS, so applying this twice is a no-op rather than an error.
export const SCHEMA_SQL = `
-- gen_random_uuid() is built into Postgres 13+ (which Prisma Postgres/Neon run), but enabling
-- pgcrypto explicitly makes this schema portable to older Postgres too, at no cost. Managed hosts
-- often refuse CREATE EXTENSION; that is fine and is skipped rather than treated as a failure.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per person who explicitly opted in to sharing their profile. Never linked to an email,
-- a payment record, or any other contact channel — see privacy.html and the consent copy in the
-- app for exactly what this is and isn't used for.
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kept for completeness of the archetype, but never displayed or exported outside this table.
  full_name TEXT NOT NULL,
  dob DATE NOT NULL,

  -- The full computed profile, exactly as the app calculates it.
  life_path_display TEXT,
  life_path_root INTEGER,
  birthday_display TEXT,
  birth_month_display TEXT,
  day_month_display TEXT,
  birth_year_display TEXT,
  expression_display TEXT,
  soul_urge_display TEXT,
  personality_display TEXT,
  personal_year INTEGER,

  -- Precomputed summary fields, so the dashboard's aggregates are plain indexed queries.
  dominant_theme_1 TEXT,
  dominant_theme_2 TEXT,
  core_need TEXT,
  age_band TEXT,       -- '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'
  tier TEXT,           -- 'personal' | 'family'

  consent BOOLEAN NOT NULL DEFAULT true,

  -- A random per-submission secret (not the sequential id) required to delete this row later, so
  -- turning sharing back off in the app can actually erase the row without needing a login system,
  -- and without one person being able to guess and delete another person's row.
  delete_token UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_profiles_life_path_root ON profiles(life_path_root);
CREATE INDEX IF NOT EXISTS idx_profiles_dominant_theme_1 ON profiles(dominant_theme_1);
CREATE INDEX IF NOT EXISTS idx_profiles_personal_year ON profiles(personal_year);
CREATE INDEX IF NOT EXISTS idx_profiles_age_band ON profiles(age_band);

-- Anonymous completion events.
--
-- The profiles table needs consent, because a name and a date of birth are personal data. This
-- table deliberately holds neither, so it can record every completion rather than only the ones
-- people opt in to — which is the only way to know a real conversion rate rather than an opt-in
-- rate. Nothing here identifies a person: no name, no date of birth, no email, no IP, no device
-- or advertising id, and no cookie. A Life Path root is one of nine values and an age band one of
-- six, so neither narrows to an individual.
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  name TEXT NOT NULL,          -- 'profile_completed' | 'reading_opened' | 'checkout_started' | 'purchase'
  tier TEXT,                   -- 'personal' | 'family'
  life_path_root INTEGER,      -- one of nine roots, not identifying
  age_band TEXT,               -- one of six bands
  source TEXT                  -- 'app' when installed to the home screen, else 'web'
);

CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
`;

// Strip -- comments, then split on the semicolons that are left. The schema contains no string
// literals or function bodies, so there are no semicolons that need protecting from the split.
export function statementsFrom(sqlText) {
  return sqlText
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

// 42P01 undefined_table — the one error that means "the schema hasn't been applied yet".
export function isMissingTable(e) {
  return !!e && (e.code === '42P01' || /relation ".*" does not exist/i.test(String(e.message || '')));
}

// Two functions can race to create the same table, and IF NOT EXISTS is checked before the lock is
// taken rather than after, so the loser sees one of these. It got what it wanted either way.
const BENIGN = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object
  '23505', // unique_violation, from the catalog insert when two CREATEs collide
]);

export async function applySchema() {
  const db = getPool();
  const applied = [];
  const skipped = [];
  for (const stmt of statementsFrom(SCHEMA_SQL)) {
    const label = stmt.split('\n')[0].slice(0, 60);
    try {
      await db.query(stmt);
      applied.push(label);
    } catch (e) {
      // CREATE EXTENSION is commonly refused on managed hosts. gen_random_uuid() is native to
      // Postgres 13+, so the schema is fine without it — record it and carry on.
      if (/extension/i.test(stmt) || BENIGN.has(e.code)) { skipped.push(label); continue; }
      throw e;
    }
  }
  return { applied, skipped };
}

// Collapses a burst of first-ever requests into one schema application: while an attempt is in
// flight everyone waits on the same promise. It is deliberately cleared once that attempt settles,
// success or failure, so this memoises "an attempt is running" and never "we already tried". A
// later missing table has to be able to trigger a real second attempt — otherwise a warm instance
// that applied the schema once would refuse to ever do it again, and quietly drop writes.
let ensuring = null;
export function ensureSchema() {
  if (!ensuring) {
    const attempt = applySchema();
    ensuring = attempt;
    attempt.then(() => { ensuring = null; }, () => { ensuring = null; });
  }
  return ensuring;
}

// Run a query. If it failed only because the tables aren't there yet, create them and run it once
// more. Any other error is the caller's to handle.
export async function withSchema(run) {
  try {
    return await run();
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await ensureSchema();
    return await run();
  }
}

// Does the schema exist right now? to_regclass answers without throwing on a missing table.
export async function schemaState() {
  const { rows } = await sql`
    SELECT to_regclass('public.profiles') IS NOT NULL AS profiles,
           to_regclass('public.events')   IS NOT NULL AS events
  `;
  return { profiles: !!rows[0].profiles, events: !!rows[0].events };
}
