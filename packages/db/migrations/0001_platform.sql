-- M0.5 infrastructure only. The domain tables follow in M3.
CREATE TABLE local_emails (id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE platform_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE workflow_probes (id TEXT PRIMARY KEY, phase TEXT NOT NULL, sequence INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
