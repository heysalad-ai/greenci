-- Automatic webhook runs retain deterministic primary IDs. Explicit operator
-- imports may retry a failed execution without overwriting its run/event history.
DROP INDEX run_dedup;
CREATE INDEX runs_commit_check ON runs(repo_id,head_sha,failing_check_name);
