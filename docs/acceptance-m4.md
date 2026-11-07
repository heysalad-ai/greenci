# M4 acceptance

- Miniflare executes real D1, KV, R2, Queues, Workflow and Durable Object bindings.
- Signed check_run → idempotent queue handling → persisted run → authenticated Diagnose/Repair/Verify → real fixture tests → verified mock PR passes.
- Migration fixture pauses at needs_you, with no PR until approval.
- Honest miss remains not_verified with no PR; out-of-scope rejects Repair and hands back.
- Original/verify logs and actual git diffs live in R2; check excerpts, fix statistics, approvals, notification records and append-only events live in D1.
- Session membership and cookie CSRF checks protect actions; illegal actions return 409; bad webhook signatures return 401. Local fixture login is unavailable remotely. Org streams are scoped; raw GitHub payloads are not broadcast.
- Pure core is 100% covered across statements, branches, lines and functions. Full suite: 36 tests; 16 builds; four browser tests.

The initial integration failure reproduced Workers' unbound-fetch TypeError; the transport now calls fetch through a closure, and all four journeys run on workerd. Stale queued actions carry attempt/state expectations; retries are bounded. A job that exhausts retries records stopped rather than claiming a result.

These are local Workers results with fake agents and real first-party fixture git/CI. The live dev environment remains in health-only scaffold mode until GitHub App/session/sandbox integration is configured. No customer code, real GitHub or real model was called in tests. Product screen fidelity remains M5, except deckless entry points required by M4.5.

## Deployment automation

Dev deploys on main; staging is manual/staging-_; production is v_ only. Workflows use environment-scoped Cloudflare credentials and require production reviewers with self-review/admin bypass disabled. Unconfigured resource IDs fail preflight. Authenticated smoke uses private remote service bindings, preserving the account-member Access policy. A failed production smoke requests Wrangler rollback for web, API and sandbox; database migrations are additive and are not rolled back automatically.

Prepared, not activated: GitHub environments need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. No credential or environment permission was created. No staging/production command was run. Merging is left to the human.
