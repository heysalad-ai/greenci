# M0.5 proof registered before implementation

- [x] Merge unrelated histories, preserve both sides and all design/brief files; push codex/greenci-m0 and open a PR.
- [x] Fresh install, lint, strict typecheck and tests pass with no Docker.
- [x] Hono Worker bundles; OpenAPI comes from Zod; missing bindings fail by name without values.
- [x] D1 local migration plus Drizzle SQLite schema; KV/R2 operations execute in Miniflare.
- [x] Queue consumption persists a platform event and fans out through OrgRoom.
- [x] RunWorkflow suspends for Diagnose, Repair, Verify and approval events; scaffold output never claims an agent fix.
- [x] OrgRoom and DeckSession WebSockets work locally, reject malformed messages, and preserve serial isolation; SSE fallback connects.
- [x] Next.js OpenNext build runs under Wrangler on :3000 and uses API service binding on :8787.
- [x] pnpm dev starts the three local Workers, mock GitHub and /deck without a container runtime or cloud credentials; shutdown frees ports.
- [x] Local email viewer reads D1 and is disabled outside local; sandbox execution fails closed until M7.
- [x] All three Workers have isolated dev/staging/production config stubs; no remote resources created or deployments performed.
- [x] CI runs unit/Miniflare integration/browser tests against Wrangler. Progress/decisions/docs updated, commit pushed to PR.

The M1 design fidelity and M4 agent journey remain separate milestones.

## Observed evidence — 2026-11-06

- Upstream merge: 74907e4, with both histories retained. `git diff origin/main -- design-system design docs/CODEX_PROMPT.md docs/CODEX_PROMPT_CLOUDFLARE.md` is empty. Draft PR: https://github.com/heysalad-ai/greenci/pull/1.
- Frozen install and lint: exit 0. Typecheck: root tests/config and all 16 workspace packages pass.
- `pnpm test`: **20 passed** across 4 files, including **7 real Miniflare integration tests**. They exercise Hono/OpenAPI, invalid request rejection, untrusted-origin rejection, local D1/KV/R2 and sandbox service-binding operations, Drizzle email writes/readback, Queue persistence and OrgRoom broadcast, SSE connection, deck hello/serial isolation/long-press messages, and all Workflow waits including approval. No live GitHub or LLM runs.
- `pnpm build`: **16 successful workspace builds**. API and sandbox bundles use `wrangler deploy --dry-run --env=""`; no upload or deployment occurs. `pnpm dev`/E2E additionally produces a complete OpenNext Worker bundle for web.
- `pnpm db:migrate`: exit 0; 0001_platform.sql applied to local D1. No remote migration ran.
- Final fresh staged checkout: `pnpm install --frozen-lockfile --offline` exits 0 (542 packages reused, no package downloads or rclone lifecycle download). It has no prior node_modules, .next, .open-next or .data state. `pnpm e2e` exits 0 with **3 browser tests passed** in 22.8s, using the real `pnpm dev` launcher and fresh D1 migration/build.
- Browser tests prove web→API service binding, storage/service probes, Node mock health, deck WebSocket connection and keyboard/button ACKs, and local email viewer. Outbound-frame assertions distinguish ordinary Enter on Command from explicit Shift+1 long press. The deck test blocks external HTTPS requests and still renders/operates with font fallbacks. Mobile layout has no horizontal overflow.
- Desktop and phone captures inspected: [desktop](evidence/m05-deck.png), [phone](evidence/m05-deck-mobile.png). The simulator reuses supplied reference ActionKey markup/CSS/icons and logo. This is a transport test surface, not a completed M1/M5 fidelity pass.
- `docker` is absent on this laptop. No Docker command is in the launcher. After E2E shutdown, `lsof` finds no listeners on 3000, 8787, 8788 or 4001.
- CI now runs install, lint, typecheck, unit/Miniflare tests, package builds and Playwright against Wrangler. Hosted results are reported separately from the local evidence.

## Boundaries

No dev, staging or production resources were created, migrated or deployed. The environment IDs are TODOs. Local probe/stream/email/deck routes have APP_ENV guards; deployment-mode execution and auth/ownership remain unverified and belong to the later deployment/M4 work. The optional container profile and Sandbox SDK runtime remain **unverified** because Docker is unavailable; local sandbox command requests fail closed. Workflows only record transport probes, with agentExecuted=false. Full state-machine guards, actual agents/fixes/checks/PRs, real mock repositories, branded product screens, email templates and mobile are still M1–M9 work.

Historical M0 evidence remains in acceptance-m0.md; its Docker-dependent runtime has been superseded.
