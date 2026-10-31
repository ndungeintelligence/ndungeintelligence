-- Clients onboarded onto the Agentic Commerce OS, and passwordless portal sign-in
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  company       TEXT,
  store_url     TEXT,
  plan          TEXT NOT NULL DEFAULT 'launch',      -- launch | growth | scale
  stage         TEXT NOT NULL DEFAULT 'audit',       -- audit | setup | connected | live
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS portal_tokens (
  token_hash    TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  used          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_email ON portal_tokens(email, created_at);

CREATE TABLE IF NOT EXISTS portal_sessions (
  session_hash  TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
