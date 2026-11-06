# GreenCI

A local-first physical command deck for AI coding agents. Diagnose, Repair, Verify.

This repository currently contains **M0 scaffold only**. Agent fixes, GitHub integration, product screens, onboarding, CLI, mobile and emails are not implemented. See [PROGRESS.md](PROGRESS.md).

## Prerequisites

Node 22 and Docker with Compose. Enable the Node-bundled Corepack shim (`corepack enable`) once to make `pnpm` available; packageManager pins the version. If your Node distribution omits Corepack, install Corepack first.

```sh
cp .env.example .env
pnpm install
pnpm dev
```

`make dev` is equivalent. Compose starts Postgres, Redis and Mailpit and waits for health. Turborepo starts host Node processes:

- Web: http://localhost:3000 (temporary unstyled scaffold page)
- API: http://localhost:4000/health and /openapi.json
- Mock GitHub: http://localhost:4001/health and /openapi.json (no repository APIs yet)
- Worker: BullMQ connection to local Redis; no agent processors yet
- Mailpit: http://localhost:8025

Ctrl-C stops host apps. Infrastructure remains available; `docker compose down` stops it without deleting data. No credentials are needed for mock/fake defaults. After dependency/image installation, M0 host startup makes no external requests. Full offline product execution is not yet implemented.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

`pnpm dev:host` is an explicit scaffold smoke mode without Docker, database or worker. E2E currently tests only the M0 web and health endpoints. Do not confuse it with the product journey due in M9.

The seed/reset scripts deliberately fail until M3. Every app has a Dockerfile built from the repository root; mobile/deck images fail explicitly until their runtimes exist. Node service images currently run source using tsx; production packaging is later work.

## Layout

- `apps/`: web, api, worker, mock-github, mobile, deck-bridge
- `packages/`: ui, tokens, core, db, agent, github, deck-protocol, cli, email
- `docs/acceptance-m0.md`: evidence and limitations
- `docs/decisions.md`: scope and decisions

No real GitHub or LLM requests run in tests. Never commit .env or .data. The design bundle referenced by the build prompt is currently missing; supply it before the fidelity milestones.
