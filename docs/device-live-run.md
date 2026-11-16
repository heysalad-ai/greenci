# Dev pad follows a real repair

The Genesis Mini AB8224 uses the existing private relay and outbound authenticated
Wi-Fi polls. Firmware 0.5.0 adds a display-only `run` command (0–6): idle,
diagnosis, repair, verification, draft ready, needs review, waiting. It cannot
start a repair, approve a PR, or merge. The operator controller is pinned to
`heysalad-ai/greenci-starter` in the owner's dev workspace.

Run `pnpm exec wrangler dev --remote --config tools/dev-pad-controller/wrangler.json
--env dev --ip 127.0.0.1 --port 8897` as one command. It uses the existing
Cloudflare account and Access sign-in. The preview inherits the encrypted dev
OpenAI binding server-side; no key is extracted. It does not replace the deployed
API. Keep it bound to loopback and shut it down after filming.

POST `/mirror` with `{ "runId": "dashboard-invite-7957943-…" }` every few seconds.
The helper reads the actual dev D1 snapshot, restricts repository/workspace, and
queues a signed phase only when needed or after twelve seconds. Green requires
`verified === true`, `state === pr_open`, and a positive PR number. Unknown or
failed states become needs-review. The pad turns lights off and shows Link stale
after 45 seconds without updates. POST `/idle` clears the mirror after capture.
This is a dev operator bridge, not automatic customer hardware onboarding.

The shared app badge polls the existing authenticated status endpoint. It shows
connected only for a healthy heartbeat less than twenty seconds old. The single
physical dev pad is restricted to the configured beta owner; being the owner of
another public workspace does not grant access.

`0009_dev_repair_budget.sql` preserves the normal two-start limit and adds an
empty-by-default table for bounded, expiring operator allowances. The dev owner
configuration permits a maximum of three for this filming session; an explicit
matching database allowance is also required. No historical counts are reset.
Other users and environments retain the normal limit.

The controller's `/speech` route supports short, AI-disclosed OpenAI narration
through the existing dev binding. Generated media is a review artifact; this
workflow does not publish to X or Product Hunt.

Validation: native firmware watchdog/LED tests and exact-board compilation;
Workers HMAC/bounds tests; D1 admission expiry and owner-isolation tests; phase
mapping refuses unverified green; browser stale/unauthorized heartbeat journey.
Physical OTA, synchronized capture and final provider evidence are recorded in
the task's acceptance ledger separately from these software checks.
