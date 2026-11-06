# Progress

- [x] Design system, screens and build brief committed
- [ ] M0 Scaffold

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
