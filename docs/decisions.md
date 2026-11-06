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
