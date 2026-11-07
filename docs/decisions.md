# Decisions

## 2026-11-06 — repository location and scope

The supplied working directory is a collection of unrelated projects in an unborn parent Git repository. Build an independent repository at `Product_Mgmt/greenci` on `codex/greenci-m0` to isolate commits. This pass implements M0, as requested by the final instruction of the prompt; M1–M9 remain tracked work.

## Missing design inputs

No GreenCI AGENTS.md, design-system directory, approved screens, static HTML, or asset bundle was found in the workspace. The Downloads archive `GreenCI-Attributed-Starter.zip` was inspected and contains an unrelated attributed GitLab reference, not the required visual inputs. It was not imported. Do not fabricate branding or claim fidelity. Product UI and visual baselines wait for those inputs. The unstyled M0 health page is explicitly temporary.

## Scaffold boundaries

Create every requested workspace now. Mobile and deck bridge are typed placeholders; Expo SDK integration follows in M8 and the bridge interface follows with the deck protocol. Package libraries contain no pretend product implementation. Seed/reset/deck/GitHub verification commands fail with a milestone message until implemented. Worker uses BullMQ, but fails unknown jobs closed. Liveness endpoints intentionally do not claim database readiness.

## Local infrastructure

Only Postgres 16, Redis and Mailpit run in Compose. Node apps run on the host. `pnpm dev` starts infrastructure and waits for health before launching apps. `pnpm dev:host` explicitly excludes infrastructure and worker for scaffold smoke tests; it is not the product quick start. Docker is absent on this laptop, so Compose and image execution cannot be verified here. No software installation or infrastructure provisioning is silently performed.

## Package manager and environment

Pin pnpm 10.34.9 using packageManager/Corepack for Node 22 compatibility. Read .env once in the root launcher and inherit it into host apps. Core configuration validates at app boot and rejects non-local deployment stubs. SANDBOX=none requires CI=true. Real providers require credentials and model selections, but no real provider is invoked in M0. Fonts are deferred with branding and will require a locally cached/self-hosted strategy to preserve offline startup.

## 2026-11-06 — upstream sync and branch authorization

Added the user-specified origin, fetched main and merged with --allow-unrelated-histories. README, PROGRESS and .gitignore conflicts retain GitHub's text first and local M0 notes second. All supplied design and brief files remain unchanged. The user's explicit instruction to push codex/greenci-m0 overrides the general greenci/* branch restriction for this build branch; GreenCI's future agent branch guard is unchanged. Draft PR #1 targets main and will remain unmerged.

## 2026-11-06 — Cloudflare remapping

The Cloudflare brief supersedes Docker infrastructure: Hono replaces the API Fastify server; RunWorkflow replaces BullMQ; Queues replace Redis fan-out; OrgRoom provides hibernatable WebSockets plus an SSE stream; DeckSession handles deck transport; Drizzle SQLite/D1 replaces Postgres; artifacts use R2 and sessions use KV. Mailpit becomes a local D1 outbox at /app/_emails. Next.js 15 remains, adapted with OpenNext and Worker Static Assets. Its API calls use a service binding. Only mock GitHub remains Node, as required for later local git repositories. Removed obsolete runtime Dockerfiles/Compose; the Sandbox Dockerfile is only for the optional M7 container profile.

## 2026-11-06 — M0.5 scope and local execution

pnpm dev applies local D1 migrations, builds the OpenNext Worker, then launches the web/API/sandbox Workers and the Node mock. The simulator is served by the web Worker at /deck, so it needs no extra process. The web build is deliberately a real Worker preview rather than next dev; re-run the command to rebuild after edits. SANDBOX=none is now allowed locally without CI; outside local it is rejected. The M0.5 sandbox is disabled and never exposes a host shell. Future trusted fixture execution and the allowlisted Sandbox.run implementation belong to M3/M7. Workflow phase probes test waitForEvent and approval transport, never simulate a verified product fix. Domain tables and agent behavior remain M3/M4 work.

## 2026-11-06 — environment and configuration boundaries

All Workers have separate dev/staging/production config blocks; D1/KV resource IDs remain TODO until provisioning is explicitly undertaken. No remote command or deployment ran for this local-only task. Requests validate configuration and binding capabilities with Zod capability schemas; errors report names without values. Deployed modes require real GitHub App configuration, a non-default webhook secret, contained sandbox and Resend credentials. Probe routes, unauthenticated WebSockets/SSE, deck tester and email viewer are local-only pending M4 authentication. Browser origins are restricted to the configured local web/API origins. .dev.vars is ignored; examples contain public local defaults. The original .env.example remains historical and is not loaded.

## 2026-11-06 — toolchain and references

Pin Wrangler 4.158.0 and its matching Miniflare 5.20261104.0-beta runtime. Integration tests use Miniflare's exported v4-options converter and an explicit module root; module paths outside that root otherwise fail at runtime. Pin Sandbox SDK 0.12.14 for the Sandbox class API specified by this brief; its optional container profile is unverified and does not participate in Docker-free development. OpenNext 1.20.16 supports the prescribed Next 15.5.29; a webpack extension alias resolves workspace TypeScript modules' .js import specifiers. The reference CSS/assets remain unchanged, fonts retain their specified fallbacks, and simulator testing blocks external font requests to exercise offline rendering. Full visual fidelity and font packaging belong to M1/M5.

Implementation references: [OpenNext setup](https://opennext.js.org/cloudflare/get-started), [Worker service bindings/local development](https://developers.cloudflare.com/workers/local-development/multi-workers/), [Workflows events](https://developers.cloudflare.com/workflows/build/workers-api/), [hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi).

## 2026-11-06 — offline installation and Command input

The first clean-cache test exposed rclone.js downloading an optional binary in its lifecycle script even with pnpm --offline. Disable that optional lifecycle script; the scaffold uses no OpenNext R2 cache upload feature and builds without it. Workerd/esbuild native installation remains allowed. A keyboard Enter on Command sends only a normal press; only an actual pointer hold or explicit Shift+1 sends long_press. Browser tests inspect outbound frames for both cases so keyboard activation cannot accidentally become approval when M4 connects this transport.

## 2026-11-06 — first dev deployment

The user authorized the first dev-only deployment using workers.dev. Reused the authenticated Wrangler account, provisioned only dev D1/KV/R2/Queue resources, applied the dev migration and deployed sandbox → API → web. SCAFFOLD_ONLY is an explicit dev-only/fake-provider mode allowing only read-only health endpoints without requiring unimplemented integration credentials; normal mode remains strict, staging/production reject this flag, all action routes stay disabled and health honestly says integrations=disabled. The dev sandbox remains a disabled service-binding Worker until M7; no container image was built or provisioned. Dev cron triggers remain off until notification jobs exist. No staging/production changes or default-branch push/PR merge occurred.

## 2026-11-06 — dev Access and live proof

Initially kept every dev URL and preview disabled. Wrangler OAuth could deploy but Access API writes returned 403. The existing Chrome HeySalad session could administer Access, avoiding a new login or token. Applied account-member, all-traffic policies only to greenci-web-dev and greenci-api-dev, then enabled their workers.dev routes and kept previews disabled. Verified anonymous requests redirect to Access and authenticated Chrome renders the real root page and health endpoints. Also verified the real remote Worker/storage/service bindings through an authenticated local probe. Resource IDs, active versions, commands and proof are in docs/deploy.md. Worker-level Access currently blocks WebSockets, so M4 must move to hostname-based Access before exposing remote socket endpoints; the scaffold has no remote action endpoints today.

## M2 — explicit verification and side effects

The pure transition function emits jobs/events/notifications/lights without I/O. A run remains repaired after passing checks until a real PR number is returned; no speculative pr_open state. Empty or unfinished check lists fail verification. Approval is scoped to the current repair attempt and reset on retry. Workflow edits are denied unless allowed by repo rules, then always require human approval. Timezone conversion is the notification caller's responsibility; the policy takes the user's local hour. Core branch coverage is an enforced 100% gate, including configuration.

## M3 — offline fixture execution and persistence

Only known first-party fixture source and test bytes can run under SANDBOX=none. The mock service rejects arbitrary patch content and validates fixture integrity before starting Node's test runner; customer code never reaches a host shell. Git commands use execFile argument arrays, validated refs, bounded buffers and timeouts. The mock GitHub client has no merge/approve method; a separate local human UI endpoint supports simulated merges later. Original runs use real commit SHAs and actual failing results rather than forging the abbreviated SHAs shown in the design. Full logs/diffs belong in R2; D1 retains keys/excerpts. Atomic versioned run writes append events only if the state update succeeds. The additional decisions table prepares the additive M4.5 storage requirement.

## M4 — durable jobs, authenticated actions and deploy gates

One Workflow owns each run and waits for action/approval events. Every domain event is persisted with a version check before scoped publication; action messages carry expected state/attempt and revoked memberships are rejected when consumed. Workers fetch must be called through a closure, not as a stored instance method, because workerd validates its this reference. Real git comparisons supply diff bytes/statistics, never model estimates. Local fixture login supplies HttpOnly SameSite cookies plus CSRF or bearer tokens; remote scaffold mode still rejects all action routes, pending real installation/session setup. Deployment workflows are prepared without creating secrets/environments or dispatching releases; staging/production TODO IDs and required-reviewer checks fail closed. Private authenticated smoke bindings avoid weakening native Worker Access for CI.

## M4.5 — SDK, routing and safe approvals

Verified the official SDK/Sandbox/HITL/guardrail guides and the installed declarations before implementing. @openai/agents and agents-extensions are pinned to 0.21.0; all agents-* transitives match. Zod v4 was already installed, so no v3 compatibility shim was introduced. The diagnoser uses read-only tool guards and structured Diagnosis output. The real repairer is a SandboxAgent with a bounded secret-free repository snapshot, AGENTS.md, filesystem/shell capabilities and a final staged-patch tool; final JSON cannot bypass staging or approval. Fake fixtures also run through the actual SDK, with tracing disabled only in fake mode so tests make no real model/tracing calls. Real mode keeps tracing on with traceIncludeSensitiveData=false and flushes it explicitly; trace IDs are persisted. The previously unimplemented Anthropic option was removed rather than retaining a misleading selector.

The current official Decisions guide describes GA, not preview. openai 7.2.0 has no typed Decisions client, so that provider uses the documented HTTP request/answer shapes. Responses uses a strict JSON schema and null confidence/probabilities; score indices are zero-based at the API boundary and converted to the product's 1–5 risk scale. Invalid/refused routing cannot verify a run and hands it back. Notification urgency never overrides the deterministic quiet-hours policy. D1 retains all decisions; fake records say fake rather than suggesting a live model was called.

Each SDK interruption has a distinct R2 state/diff key and approval record. The browser receives only the proposed diff, never serialized RunState. API and Workflow both check state/attempt/revision; a queued or stale approval cannot approve a later interruption. Comment commands additionally verify current repository write permission and membership. Auto mode is owner-only, off by default and applies to newly created runs; automatic repair/verify is a separate opt-in. The repair/verify boundary still re-runs real fixture checks and recomputes the git diff.

## M4.5 — offline rendering and external activation

The approved static landing markup is compiled as trusted repository content, with escaped placeholder configuration and unchanged design assets. The only intended composition change is software-only pricing/deckless navigation. Self-host the same approved font faces from locked Fontsource packages instead of next/font/google: repeated clean offline builds must not contact a font server. Original design-system CSS remains byte-identical. Reference iframes use the same local font assets. Browser tests use fresh .data/e2e-* stores so a simulated human merge cannot alter the developer's fixture history.

The official @cloudflare/sandbox/bridge adapter and a private dev-only container profile are prepared, but not activated: this laptop has no Docker, no live OpenAI key was supplied, and the bridge needs a bearer secret plus an Access-compatible server endpoint. The normal dev sandbox remains disabled and no new public shell route was exposed. Node-local selection uses only Docker networkMode=none when explicitly selected and available, otherwise SDK fake; never Unix-local. M4.5 is locally verified, not a claim that customer repositories or live models operate in hosted dev. Real GitHub App/session setup remains external/M7 work. Full native screens remain M8; the mobile authenticated action adapter is implemented now.

## M4.5 — approval payloads are derived, not model-authored

A final review reproduced an approval-size bypass in the pre-activation SDK adapter: a model could describe a large patch with a small diff string. The regression test fails against the previous committed adapter and passes after deriving a conservative before/after line count from the actual original snapshot and proposed file contents. The approval screen renders those contents as a deterministic review diff; it does not trust a model-authored diff. Actual verification and PR eligibility still use the real git comparison and fresh check results. No hosted action was enabled while this was corrected.
