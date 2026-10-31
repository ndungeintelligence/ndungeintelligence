-- Ndunge Intelligence core schema
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  phone         TEXT,
  industry      TEXT,
  interest      TEXT,
  budget        TEXT,
  message       TEXT,
  source        TEXT,
  ip            TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ip ON leads(ip, created_at);

CREATE TABLE IF NOT EXISTS payments (
  reference     TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  offer_id      TEXT NOT NULL,
  offer_name    TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'ZAR',
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  status        TEXT NOT NULL DEFAULT 'initialized',
  channel       TEXT,
  paid_at       TEXT,
  receipt_sent  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);

CREATE TABLE IF NOT EXISTS subscribers (
  email         TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  source        TEXT
);

CREATE TABLE IF NOT EXISTS email_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  kind          TEXT NOT NULL,
  to_addr       TEXT NOT NULL,
  subject       TEXT,
  ok            INTEGER NOT NULL,
  detail        TEXT
);
