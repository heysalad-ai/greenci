# GreenCI

**Red to green, one key at a time.** A HeySalad project.

GreenCI is a physical command deck for AI coding agents. It has one command key and three green action keys: **Diagnose**, **Repair** and **Verify**. When a GitHub check fails, GreenCI finds the cause, writes a fix on its own branch, re-runs every check, and then opens a pull request for you to review.

## What's in this repo today

| Path                   | What                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-system/`       | Brand book (`BRAND.md`), tokens (`tokens.json`, `tokens.css`), component CSS (`components.css`), one folder per component with guidelines and a live preview, logos and the seven key mood faces. |
| `design/screens/`      | PNG renders of every approved screen: lifecycle journey, states, web dashboard, run detail, onboarding, CLI, mobile, hardware, landing page, emails, copy, promo, swag.                           |
| `design/static/`       | The same screens as plain HTML, to copy markup and copy from.                                                                                                                                     |
| `design/boards/`       | Editable design sources from the design canvas.                                                                                                                                                   |
| `docs/CODEX_PROMPT.md` | The full end-to-end build brief for Codex: local first, then dev, staging and prod.                                                                                                               |
| `AGENTS.md`            | Working and safety rules for coding agents.                                                                                                                                                       |

## Build it

Open Codex at the root of this repo and paste the contents of `docs/CODEX_PROMPT.md`. It builds milestone by milestone (M0–M9) and keeps `PROGRESS.md` updated.

Target local experience once built:

```bash
cp .env.example .env
pnpm install
pnpm dev
```

## Brand at a glance

- Emerald `#0E9F6E` and charcoal `#23272E`. No gradients.
- Bricolage Grotesque for headlines, Geist for text, Geist Mono for anything a developer would type.
- The logo is the smiling keycap: two check-mark eyes and a smile. Always keep the charcoal base lip.

Logo and brand are concept work; no trademark search has been done yet.

## Dev deployment

The scaffold is live at [greenci-web-dev.heysalad-o.workers.dev](https://greenci-web-dev.heysalad-o.workers.dev/), behind Cloudflare Access for HeySalad Cloudflare account members. [API health](https://greenci-api-dev.heysalad-o.workers.dev/healthz) is protected the same way. It is a health-only scaffold with integrations and command execution disabled. See [deployment commands and evidence](docs/deploy.md). Staging and production have not been deployed.

## Current runtime — Cloudflare M0.5

This section supersedes the Docker quick start and historical M0 notes below. Node 22 with Corepack/pnpm is sufficient. No Docker, Cloudflare account, login, or API key is needed for local development.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The launcher applies D1 migrations **locally**, builds Next.js through OpenNext, and starts three `wrangler dev` processes plus the Node mock GitHub:

- Web: http://localhost:3000 — scaffold shell, served by Workers Static Assets/OpenNext.
- API: http://localhost:8787/healthz and `/openapi.json` — Hono on Workers.
- Deck simulator: http://localhost:3000/deck — keys 1–4 and button presses connect to DeckSession. Hold Command for 800ms or use Shift+1 to send a long press. This checks transport only; it does not run an agent.
- Local email viewer: http://localhost:3000/app/_emails — D1 outbox, disabled outside local.
- Sandbox stub: http://localhost:8788/healthz — reports execution disabled; no Docker process starts.
- Mock GitHub: http://localhost:4001/health — Node shell, repository fixtures follow in M3.

The web server calls the API through the `API` Worker service binding. `/api/health` proves that binding; `/__local/bindings` on the API tests D1, KV, R2 and the sandbox service. Local state persists in `.data/wrangler/`. Ctrl-C stops all local processes. Re-run `pnpm dev` after source edits to rebuild the Workers web bundle; `dev:next` is an optional frontend-only workflow, not the verified full-stack runtime.

Safe local defaults are in `wrangler.jsonc`. Optional secret overrides belong in `apps/api/.dev.vars`, using `.dev.vars.example` as the template. No copy step is necessary for mock/fake defaults. `.env` is no longer read by the launcher. Never commit `.dev.vars` or credentials.

```sh
pnpm lint
pnpm typecheck
pnpm test            # unit + real Miniflare integration
pnpm build          # package and Worker dry-run bundles; never deploys
pnpm build:workers  # also builds the OpenNext Worker
pnpm exec playwright install chromium
pnpm e2e            # starts the same pnpm dev command; browser + service bindings
```

M0.5 implements platform transport and storage scaffolding. It does **not** implement the M1 product screens or the M3/M4 agent journey. `RunWorkflow` records transport probes and waits for key/approval events; it never claims a diagnosis, test pass or fix PR. The local sandbox rejects command execution. The optional Cloudflare Sandbox SDK container profile is reserved for M7 and remains unverified here. Seed/reset remain deliberately disabled until M3.

All three Workers declare isolated `dev`, `staging`, and `production` profiles, with resource IDs marked TODO. No remote infrastructure has been created or deployed. Staging and production remain manual gates. See [the migration evidence](docs/acceptance-m05.md) and [decisions](docs/decisions.md).

---

## Local M0 scaffold notes (before Cloudflare migration)

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
