# Progress

## Custom domains — verified, 14 November 2026

HTTPS is active for greenci.dev (public preview dev Worker) and beta.greenci.dev (private web dev Worker). Deployed API version 2e8ed1c8-3429-47db-beb8-f47af2d52f3a only to dev with the beta canonical origin. Signed custom-host session creation lists the real practice repository; dashboard and run detail load the real draft PR and 1/1 passing check. Anonymous beta/API routes still require Access with the same audience. Public HTTPS smoke passes. A user-approved temporary preference for the ISP's existing secondary DNS server enabled browser verification while its primary cached old DNS; original automatic DNS is restored. Cold requests through the stale ISP cache can still lag. No policy, secret, staging/production deployment, new repair or merge changed. Full evidence: [docs/custom-domains.md](docs/custom-domains.md).

## Private beta — real repair verified, 14 November 2026

Fixed signed Workers session validation, contained sandbox startup and guarded native SDK patches. The installed GitHub App is restricted to `heysalad-ai/greenci-practice`; the existing OpenAI secret powered a real `gpt-6-sol` diagnosis and repair. Run `run-b0359999-a4ce-4e38-9937-3f71a044d550` verified GitHub checks on repair SHA `c3ac958f7a4509e3ed6ab017e85d33df44e3553e` and the App opened [draft PR #1](https://github.com/heysalad-ai/greenci-practice/pull/1). Only `src/add.mjs` changed; push and PR CI pass, and the default branch is unchanged. The first failed attempt remains recorded; independent operator retries preserve history. Lint, 18 typechecks, 74 tests, 100% core coverage, 18 builds and seven browser journeys pass. Private API/web and the retry migration are deployed only to dev; Access and the public preview remain intact. No PR was merged or approved. Cyber visibility returned 404, so Cyber inference remains disabled. Exact live evidence and versions: [docs/private-beta.md](docs/private-beta.md).

## Public site preview — 14 November 2026

The user selected a public preview first. A separate dev-only static Worker publishes the landing and clearly labeled M5 screen captures, while the existing private web/API services retain Access. The public preview has no live GitHub/model/repair or commerce capability. See docs/public-preview.md for the build, checks and deployment record.

- [x] Design system, screens and build brief committed
- [x] M0 Scaffold

## M5 — product screens (web)

- [x] Dashboard rebuilt to the approved board: top bar, side nav, state-led greeting, banner, live stats, filters, run list, on-screen deck that highlights the key the oldest failing run needs, activity.
- [x] Run detail rebuilt: hero with mood and one status chip, on-screen deck (keys 2–4 work too), Diagnose / Repair / Verify phase cards, coloured diff, check list with progress, "likely unrelated" marking, PR strip, Needs-you approval panel, grouped routing decisions with probabilities, timeline from run events.
- [x] Onboarding is the four-step flow (Plug in → GitHub → Repos → First fix) with the deckless skip.
- [x] `/app/_states` renders every run state with the dashboard's own helpers.
- [x] Fixed: disabled keys looked pressable; "Failing" showed a blue in-progress spinner.
- [x] All new strings live in `packages/core/src/copy.ts`; core coverage stays at 100%.
- [x] Lint, typecheck, 47 unit/integration tests, 7 browser tests and the dev worker build pass. Evidence: docs/fidelity/app-m5.md.
- [ ] Mobile (Expo, M8) and full CLI output (M6) remain.

## Previous milestone — M4.5 local implementation

- [x] Step 1 and M0.5 retained; M1, M2, M3 and M4 committed in order.
- [x] SDK 0.21.0, Zod v4, three Decisions providers, guarded tools and R2 approval/resume implemented.
- [x] Write-permission-checked comments, owner-only auto mode, deckless web journey and CLI/mobile action adapters implemented.
- [x] Approved landing markup/assets rendered with software-only pricing and offline fonts. Desktop/mobile evidence: docs/fidelity/landing.md.
- [x] Local checks: 47 tests, 100% core coverage, 18 builds, seven browser tests.
- [x] Updated existing dev API/web and additive migrations; authenticated health/landing smoke passes and anonymous Access redirects remain intact.
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

## Dev Wi-Fi pad control and OTA

Added owner/session/CSRF-protected device controls at `/app/device`, a public
credential-protected machine gateway, and a relay with no public route. Existing
Cloudflare Access stays enabled; only dev resources were deployed. The standalone
Genesis Mini pad completed real Wi-Fi updates, including final 0.3.7 → 0.3.9
(ota_1 → ota_0), and reported a healthy boot. An unconfirmed 0.3.8 trial was
metadata-verified ABORTED while the healthy 0.3.7 fallback remained VALID. Arduino's
default early OTA auto-confirm was overridden so application checks own health.
The companion firmware keeps the original display/pin/LED defaults, uses a fresh
private recovery backup and dual application slots, and requires an idle lease
before OTA. Remote microphone capture and real CI key dispatch are not exposed.

Validation: lint, 20 package typechecks/builds, 76 unit/runtime tests, 100% core
coverage, eight browser tests, and 14 firmware/setup Python tests pass. Live
unauthenticated app/device/operator responses remain 302/401/404 respectively.
See docs/device-ota.md and the companion firmware's evidence ledger. Physical
bad-digest/power-cut injection, visible brightness, battery cold-start and actual
microphone audio are not claimed by these results. The original GitHub repair
history and public preview remain intact; no staging/production work.

## Dev battery telemetry

0.4.2 completed a real wireless update and healthy boot on ota_0. The page shows
user-labelled 1500 mAh capacity and an explicitly unverified ADC-derived voltage
(~2.69–2.70 V). That low reading has no percentage; a meter comparison is needed
to distinguish a low cell from measurement error. The user confirmed direct LiPo
connection and has no meter. No measured remaining mAh, runtime, charging state,
battery-only acceptance or physical screen acceptance is claimed.

Legacy telemetry remains accepted for rollback, invalid battery percentages are
rejected, and the native battery test checks invalid/profile boundaries and
monotonic coarse estimates. Lint, 20 typechecks, 76 service/unit tests, 100% core
coverage, eight browser journeys and the target firmware build pass. Only the
dev relay/web Workers changed; Access and the existing repair scope remain intact.

## Sealed-pad voltage scaling audit

0.4.3 is live/healthy after a wireless update. Factory calibration worked across
16 diagnostic groups; two ADC ranges and Arduino/ESP-IDF conversion paths agree
with ~1.35 V at GPIO8, or ~2.7 V under the documented divider. No obvious software
scale error, saturation or substantial settling error was found. The setup call
is now explicit; no multiplier was guessed and normal sampling is restored.
The sealed pack could not be disconnected and no meter is available, so actual
cell voltage and fitted divider values remain unverified. No public Worker or
Access changes were needed. See docs/evidence/voltage-audit-dev.json.

## Local account-wide baseline audit (2026-11-15)

Added `pnpm audit:github` for read-only inventory, pinned default commits, observed CI rollups, dependency alert counts, classic branch protection metadata, security-feature status and static workflow/configuration checks. Fake transport tests cover pagination, forbidden endpoints/mutations, privileged checkout, shell interpolation, immutable actions, missing checks, truncated trees and API-denial/partial-response coverage. Reports remain private under ignored `.data/github-audit/`; no audited repository is modified and no dev App installation is expanded. This remains a baseline: full source analysis, fresh builds, rulesets, exploitability and runtime security are not verified. The initial read-only audit stayed local; the later owner-authorised repair/dashboard work is recorded below.

## Dev audit dashboard and first security repair batch (2026-11-15)

Added private owner/org-scoped audit snapshots, `/app/audit` with searchable inventory, findings and real draft-review links, and a guarded operator-assisted repair branch publisher. Initial security/runtime repairs were prepared as draft PRs in three owner-authorised repositories. Private repository names, findings, PR details and per-repair verification evidence remain in private dev R2/local artifacts and are excluded from this public source tree. Local verification is separate from actual PR check status; external-provider failures are not claimed fixed. Default branches, settings and App permissions remain unchanged. Dev deployment keeps Access/session/owner/tenant protections; no merge or staging/production deployment occurred.
