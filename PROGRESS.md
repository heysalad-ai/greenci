# Progress

- [x] Design system, screens and build brief committed
- [x] M0 Scaffold

## Current milestone — M4.5 local implementation

- [x] Step 1 and M0.5 retained; M1, M2, M3 and M4 committed in order.
- [x] SDK 0.21.0, Zod v4, three Decisions providers, guarded tools and R2 approval/resume implemented.
- [x] Write-permission-checked comments, owner-only auto mode, deckless web journey and CLI/mobile action adapters implemented.
- [x] Approved landing markup/assets rendered with software-only pricing and offline fonts. Desktop/mobile evidence: docs/fidelity/landing.md.
- [x] Local checks: 46 tests, 100% core coverage, 18 builds, seven browser tests.
- [ ] Live OpenAI/container bridge and real GitHub App activation: external credentials/runtime setup still required. Live dev actions remain disabled; no staging/production work.

See docs/acceptance-m45.md for the precise implemented/activated boundary. M5 screen fidelity, M6's full CLI and M8's Expo screens remain later milestones.

## Previous checkpoint — first Cloudflare dev deployment

- [x] Dev scaffold deployed to https://greenci-web-dev.heysalad-o.workers.dev/.
- [x] API /healthz and web→API health verified live; root page inspected in authenticated Chrome.
- [x] Cloudflare Access restricts both URLs to Cloudflare account members; anonymous requests redirect to sign-in.
- [x] Dev D1/KV/R2/Queue resources created and dev migration applied; Workflows/DO bindings deployed.
- [x] No staging/production resource, deployment, migration or route change. No PR merged.
- [x] Lint/typecheck, 22 tests, 16 builds and 3 local browser tests pass. Commands, versions and results: docs/deploy.md.

The sandbox remains a disabled stub and integrations remain off in the explicit health-only dev profile. Next: dev deployment automation, then M1. The M0.5 notes below describe its earlier checkpoint and are superseded where they say no remote resources existed.

Synced the upstream OpenAI/deckless brief and AGENTS update after deployment. Its implementation is scheduled for M4.5, after M1–M4. Supplied CODEX_PROMPT briefs are excluded from formatting so CI preserves their original text. Local lint/typecheck and all 22 tests pass after the sync; runtime code is unchanged.

## Previous checkpoint — M0.5 Cloudflare

The design system and both briefs are now present. Their files are preserved byte-for-byte from upstream. The original Docker and missing-design notes below are historical evidence from M0.

- [x] Add origin, fetch, merge unrelated histories; retain upstream and local text in all conflicts.
- [x] Push codex/greenci-m0 and open draft PR #1 into main.
- [x] Replace Fastify API/BullMQ/Compose with Hono, Workflows, Queues, OrgRoom/DeckSession and local D1/KV/R2.
- [x] Next.js 15 OpenNext Worker, Static Assets, API service binding, Docker-free local sandbox stub.
- [x] Drizzle SQLite infrastructure schema/migration and D1 local email outbox/viewer.
- [x] Local deck transport tester with reference ActionKey markup and keyboard/button input.
- [x] Environment-isolated config stubs, runtime configuration validation, local-only probe routes.
- [x] Final checks: lint/typecheck, 20 tests, all 16 package builds, clean-checkout install and 3 browser tests pass. Evidence in docs/acceptance-m05.md. M0.5 commit updates PR #1.

No remote deployments or resources were created. Dev provisioning and deployment/CD remain a later step. M1–M9 remain open; M4 must replace transport probes with actual domain orchestration before any fix is claimed.

---

## Local M0 scaffold notes (before Cloudflare migration)

# GreenCI progress

## M0 — scaffold implemented; Docker verification pending

Implemented workspace layout, Node 22/pnpm/Turbo tooling, strict TypeScript, ESLint/Prettier, Vitest, Playwright, Next.js 15 / React 19 shell, Fastify 5 service shells with Zod/OpenAPI, BullMQ worker shell, local Compose, Dockerfiles, safe environment defaults, boot validation, Make targets and CI workflow.

Verified: lint, typecheck, 13 tests, all 15 workspace builds and one browser smoke test pass. Lockfile installation also succeeds offline. Browser test cleanup leaves no service listeners. Verification outcomes are recorded in docs/acceptance-m0.md. Docker is absent on the execution laptop. Design assets and original AGENTS.md are absent; see docs/decisions.md.

## Remaining milestones

- M1: import supplied tokens/assets; implement reference UI and comparison page.
- M2: pure state machine, guards, shared copy, notification policy, full branch coverage.
- M3: Drizzle schema/migrations/seeds, real mock git repositories and CI.
- M4: jobs, agent orchestration, authenticated API, signed webhooks, SSE.
- M5: faithful web/onboarding, states, simulator/protocol, bridge interface, visual evidence.
- M6: CLI and device login with snapshots.
- M7: provider tools, sandbox, GitHub App integration and live practice verification.
- M8: Expo, emails, push, digest.
- M9: full journeys, hardening, reset, visual baselines, environment transition guidance.

## M1 — tokens and component library

Typed tokens generated from the supplied JSON and byte-identical CSS output; all ten reference component wrappers and `/app/_ui` comparison catalogue implemented. Original assets/CSS unchanged. Lint/typecheck, 23 unit/integration tests, 16 builds and four browser tests pass. Light/dark and mobile evidence: docs/fidelity/ui.md. M2 is next; landing/product screen implementation remains M5.

## M2 — pure core rules

State machine, runtime schemas, safety guards, mood mapping, redaction and notification policy implemented. Every state/event pair is tested; no empty/pending/failed check set can be verified, protected/workflow/oversized changes require approval, retries stop after three attempts. `pnpm test:core` enforces 100% statements/branches/functions/lines across all core source files. Lint/typecheck, 31 tests and core build pass. M3 data/mock GitHub is next.

## M3 — D1 data and real local git fixtures

Added the domain tables, additive D1 migration, validated run repository with optimistic concurrency and atomic append-only events, local seed for Sam/acme/greenci/deck/rules, and five real bare git repositories. Mock CI really executes immutable first-party fixture tests; practice/payments/ledger fail before their approved fixes and pass afterwards. Mock PR creation rechecks actual branch CI and protected-path approval, and PR metadata survives restart. Signed webhooks use HMAC-SHA256. Lint/typecheck, 35 tests and affected package builds pass; local migration and seed ran successfully. Runtime runs will be created from signed failures in M4; historical dashboard display fixtures/fidelity remain M5. Nothing remote was migrated in this milestone.

## M4 — authenticated API, Workflows and fake agent

Signed webhooks create idempotent runs; authenticated API actions drive durable Diagnose/Repair/Verify jobs against real local fixture git and CI. All four journeys pass, including migration approval, honest miss and out-of-scope handback. D1 stores domain history, R2 stores logs/diffs, org rooms publish scoped updates and SSE. OpenAPI includes domain run/action schemas. Guards and verification are enforced again at the GitHub boundary. Lint/typecheck, 36 tests, 100% core coverage, 16 builds and four browser tests pass. Deployment Actions are prepared; GitHub environment credentials/review configuration remain a human setup step. See docs/acceptance-m4.md. M4.5 is next. Live dev remains health-only until external integrations exist; no staging/production activity.
