-- Run this once against the Vercel Postgres database (see SETUP.md).
-- One row per person who explicitly opted in to sharing their profile for
-- anonymised product/marketing insight. Never linked to an email, payment
-- record, or any other identifiable contact channel — see SETUP.md and the
-- consent copy in the app itself for exactly what this is used for.

-- gen_random_uuid() is built into Postgres 13+ (which Vercel Postgres/Neon runs), but enabling
-- pgcrypto explicitly here makes this schema portable to older Postgres too, at no cost.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kept for completeness of the archetype (per the "full profile" scope
  -- decision) but never displayed or exported outside this table.
  full_name TEXT NOT NULL,
  dob DATE NOT NULL,

  -- Full computed profile, exactly as NumeraFlow calculates it.
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

  -- Precomputed, indexable summary fields (avoids parsing JSON for every
  -- aggregate query the dashboard runs).
  dominant_theme_1 TEXT,
  dominant_theme_2 TEXT,
  core_need TEXT,
  age_band TEXT,       -- '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'
  tier TEXT,           -- 'personal' | 'family' (which product tier they're on)

  consent BOOLEAN NOT NULL DEFAULT true,

  -- A random per-submission secret (not the sequential id) required to delete this row later, so
  -- turning "data sharing" back off in the app can actually erase the row without needing a login
  -- system, and without one person being able to guess and delete another person's row.
  delete_token UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_profiles_life_path_root ON profiles(life_path_root);
CREATE INDEX IF NOT EXISTS idx_profiles_dominant_theme_1 ON profiles(dominant_theme_1);
CREATE INDEX IF NOT EXISTS idx_profiles_personal_year ON profiles(personal_year);
CREATE INDEX IF NOT EXISTS idx_profiles_age_band ON profiles(age_band);


-- ─────────────────────────────────────────────────────────────────────────────
-- Anonymous completion events.
--
-- The profiles table above needs consent, because a name and a date of birth
-- are personal data. This table deliberately holds neither, so it can record
-- every completion rather than only the ones people opt in to — which is the
-- only way to know a real conversion rate rather than an opt-in rate.
--
-- Nothing here identifies a person: no name, no date of birth, no email, no IP,
-- no device or advertising id, and no cookie. A Life Path root is one of nine
-- values and an age band one of six, so neither narrows to an individual.
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  name TEXT NOT NULL,          -- 'profile_completed' | 'reading_opened' | 'checkout_started' | 'purchase'
  tier TEXT,                   -- 'personal' | 'family'
  life_path_root INTEGER,      -- 1-9, or 11/22/33/44 reduced — one of nine, not identifying
  age_band TEXT,               -- one of six bands
  source TEXT                  -- 'app' when installed to the home screen, else 'web'
);

CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
