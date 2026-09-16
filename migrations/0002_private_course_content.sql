-- Workbooks and printable files are provisioned privately in D1, not in Git.
CREATE TABLE IF NOT EXISTS bd_content (
  id TEXT PRIMARY KEY,
  blocks TEXT NOT NULL DEFAULT '[]',
  printable TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
