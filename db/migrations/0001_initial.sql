-- Searchlight: initial schema.
-- Runs inside a transaction managed by db/index.js runMigrations() and is
-- idempotent (IF NOT EXISTS). A fresh DATABASE_URL gets the same shape as an
-- existing one, and re-running never drops data.

-- ---------------------------------------------------------------
-- Users: one row per real person who signs in with Google.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  google_id     TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  picture       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- oauth_accounts: encrypted Google credentials for each user.
-- Only the encrypted payload is stored; the browser/session never sees it.
-- `refresh_token` may be empty if Google did not hand one out.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_accounts (
  user_id           BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_id         TEXT NOT NULL,
  email             TEXT NOT NULL,
  name              TEXT NOT NULL DEFAULT '',
  picture           TEXT NOT NULL DEFAULT '',
  refresh_token_enc TEXT NOT NULL DEFAULT '',
  access_token_enc  TEXT NOT NULL DEFAULT '',
  access_expires_at TIMESTAMPTZ,
  scope             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email ON oauth_accounts (email);

-- ---------------------------------------------------------------
-- user_sites: Search Console properties the user can access, so every
-- property association and its last sync are stored per user.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sites (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_url         TEXT NOT NULL,
  permission_level TEXT NOT NULL DEFAULT 'Unknown',
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_url)
);

-- ---------------------------------------------------------------
-- Sessions: stable store consumed by connect-pg-simple.
-- The sid cookie only references the encrypted row below; the user's Google
-- tokens are never written into the session.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR NOT NULL COLLATE "default",
  "sess"   JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
ALTER TABLE "session" ADD CONSTRAINT IF NOT EXISTS "session_pkey"
  PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
