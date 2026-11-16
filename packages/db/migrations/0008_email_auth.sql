-- Dev-only passwordless email identity; linking requires fresh, explicit GitHub consent.
CREATE TABLE email_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
 github_user_id TEXT UNIQUE, revoked INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE email_challenges (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, browser_hash TEXT NOT NULL,
 code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX email_challenges_expiry ON email_challenges(expires_at);
ALTER TABLE beta_oauth_states ADD COLUMN email_account_id TEXT;
