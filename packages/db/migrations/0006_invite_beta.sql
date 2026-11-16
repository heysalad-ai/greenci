-- Explicit invitations and isolated GitHub installation connections; dev beta only.
CREATE TABLE beta_invites (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 email TEXT NOT NULL, login TEXT NOT NULL, expires_at TEXT NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0, github_id TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE beta_identities (
 user_id TEXT PRIMARY KEY, invite_id TEXT NOT NULL,
 github_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL,
 access_sub TEXT NOT NULL, email TEXT NOT NULL
);
CREATE TABLE beta_oauth_states (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
 invite_id TEXT NOT NULL, access_sub TEXT NOT NULL, email TEXT NOT NULL,
 verifier TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE beta_connections (
 repo TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL,
 installation_id TEXT NOT NULL, default_branch TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX beta_connections_org ON beta_connections(org_id);
-- Enforce the admission cap in the same transaction as reservation/run creation.
CREATE TRIGGER beta_repair_daily_cap BEFORE INSERT ON dashboard_repairs
WHEN NEW.org_id LIKE 'invite-%' AND (
 SELECT COUNT(*) FROM dashboard_repairs WHERE org_id=NEW.org_id
 AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')
)>=2
BEGIN SELECT RAISE(ABORT,'Beta repair admission limit'); END;
CREATE TRIGGER beta_connection_cap BEFORE INSERT ON beta_connections
WHEN NOT EXISTS (SELECT 1 FROM beta_connections WHERE repo=NEW.repo)
AND (SELECT COUNT(*) FROM beta_connections WHERE org_id=NEW.org_id)>=5
BEGIN SELECT RAISE(ABORT,'Beta connection admission limit'); END;
