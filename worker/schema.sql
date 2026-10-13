-- Just Living waitlist (Cloudflare D1). Applied with:
--   wrangler d1 execute jl-waitlist --remote --file worker/schema.sql
CREATE TABLE IF NOT EXISTS subscribers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contact       TEXT NOT NULL,              -- email (lowercased) or E.164 phone
  kind          TEXT NOT NULL,              -- 'email' | 'phone'
  product       TEXT NOT NULL DEFAULT 'next-drop',
  size          TEXT NOT NULL DEFAULT 'any',
  source        TEXT NOT NULL DEFAULT 'site',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT,
  UNIQUE (contact, product, size)
);
CREATE INDEX IF NOT EXISTS idx_sub_product ON subscribers (product, unsubscribed_at);

CREATE TABLE IF NOT EXISTS sends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  recipients  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
