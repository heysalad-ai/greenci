-- One explicitly requested hosted dashboard repair per organisation at a time.
CREATE TABLE dashboard_repairs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX dashboard_repairs_active_org ON dashboard_repairs(org_id) WHERE active=1;
