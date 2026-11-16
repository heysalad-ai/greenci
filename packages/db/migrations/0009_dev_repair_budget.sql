-- Empty by default. An operator may grant a bounded, expiring dev filming budget.
-- Customer admission remains two repairs; records/counts are never reset.
CREATE TABLE dev_repair_budgets (
 org_id TEXT PRIMARY KEY,
 daily_limit INTEGER NOT NULL CHECK(daily_limit BETWEEN 2 AND 10),
 expires_at TEXT NOT NULL
);
DROP TRIGGER IF EXISTS beta_repair_daily_cap;
CREATE TRIGGER beta_repair_daily_cap BEFORE INSERT ON dashboard_repairs
WHEN NEW.org_id LIKE 'invite-%' AND (
 SELECT COUNT(*) FROM dashboard_repairs WHERE org_id=NEW.org_id
 AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')
)>=COALESCE((
 SELECT daily_limit FROM dev_repair_budgets WHERE org_id=NEW.org_id
 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
),2)
BEGIN SELECT RAISE(ABORT,'Beta repair admission limit'); END;
