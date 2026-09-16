CREATE TABLE IF NOT EXISTS bd_purchases (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT,
  payment_intent TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bd_purchase_email ON bd_purchases(email,status);
CREATE INDEX IF NOT EXISTS bd_purchase_user ON bd_purchases(user_id,status);
CREATE TABLE IF NOT EXISTS bd_payment_events (id TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bd_revocations (payment_intent TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bd_progress (
  user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
  seconds REAL NOT NULL DEFAULT 0, last_field TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,lesson_id)
);
CREATE TABLE IF NOT EXISTS bd_lab_access (user_id TEXT PRIMARY KEY, unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bd_studies (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS bd_studies_owner ON bd_studies(user_id,updated_at);
CREATE TABLE IF NOT EXISTS bd_answers (
  user_id TEXT NOT NULL, scope TEXT NOT NULL, field_id TEXT NOT NULL,
  value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,scope,field_id)
);
CREATE TABLE IF NOT EXISTS bd_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
