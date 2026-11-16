-- Public GitHub admission is opt-in and distinct from Access-bound invitations.
ALTER TABLE beta_identities ADD COLUMN admission TEXT NOT NULL DEFAULT 'invite' CHECK(admission IN ('invite','public'));
ALTER TABLE beta_oauth_states ADD COLUMN admission TEXT NOT NULL DEFAULT 'invite' CHECK(admission IN ('invite','public'));
CREATE TABLE public_auth_rate (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at TEXT NOT NULL);
-- Bound outstanding public authentication work independently of repair capacity.
CREATE TRIGGER public_oauth_capacity BEFORE INSERT ON beta_oauth_states
WHEN NEW.admission='public' AND (
 SELECT COUNT(*) FROM beta_oauth_states WHERE admission='public'
 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
)>=100
BEGIN SELECT RAISE(ABORT,'Public sign-in capacity'); END;
-- Public account creation must not bypass the existing per-workspace limits.
CREATE TRIGGER public_repair_capacity BEFORE INSERT ON dashboard_repairs
WHEN EXISTS (SELECT 1 FROM beta_identities WHERE user_id=NEW.user_id AND admission='public')
AND (
 SELECT COUNT(*) FROM dashboard_repairs d JOIN beta_identities b ON b.user_id=d.user_id
 WHERE b.admission='public' AND d.created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')
)>=20
BEGIN SELECT RAISE(ABORT,'Public repair capacity'); END;
