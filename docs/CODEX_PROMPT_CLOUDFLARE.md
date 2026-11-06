# Codex brief: run GreenCI on Cloudflare

Paste everything below the line into Codex, from your local `greenci` folder.

This brief **overrides** these parts of `docs/CODEX_PROMPT.md`: §2 (stack), the infra parts of §6, §7 (transport) and §10 (environments). Everything else still applies: the screens, the run state machine, the safety guards, the copy, the milestones and the tests.

---

## Step 1: get in sync with the GitHub repo (do this first)

Your local folder was scaffolded on its own and is missing `design-system/`, `design/` and the briefs. Fix that before anything else:

```bash
git remote add origin https://github.com/heysalad-ai/greenci.git   # skip if it exists
git fetch origin
git merge origin/main --allow-unrelated-histories
```

On conflicts in `README.md`, `AGENTS.md`, `PROGRESS.md` and `.gitignore`, keep both: GitHub's text first, then your scaffold notes. Never drop anything under `design-system/`, `design/` or `docs/`. Then run `pnpm install && pnpm lint && pnpm typecheck && pnpm test`, push `codex/greenci-m0` and open a PR into `main`. Read `AGENTS.md` and `design-system/BRAND.md` before continuing.

## Step 2: re-platform the M0 scaffold to Cloudflare (milestone M0.5)

Everything runs on Cloudflare Workers. Local development uses `wrangler dev` (Miniflare), which simulates D1, Queues, Durable Objects, Workflows, KV and R2 on the laptop, **so Docker is not needed for M0–M6.**

| Concern | Was | Now |
|---|---|---|
| Web app (`apps/web`) | Next.js on Node | Next.js 15 on Workers via `@opennextjs/cloudflare`. Static assets via Workers Static Assets. |
| API (`apps/api`) | Fastify | **Hono** on Workers (`greenci-api`). Zod schemas unchanged; OpenAPI via `@hono/zod-openapi`. |
| Background jobs (`apps/worker`) | BullMQ + Redis | **Cloudflare Workflows**: one Workflow instance per run (`RunWorkflow`). Steps are diagnose → repair → verify. Use `step.waitForEvent` for key presses and for **Needs you** approvals. Queues (`greenci-events`) carry webhook fan-out. |
| Live updates | SSE + Redis pub/sub | **Durable Object `OrgRoom`** (one per org) with hibernatable WebSockets. Web, mobile, CLI and deck all subscribe. Keep an SSE fallback endpoint for the CLI. |
| Deck connection | WebSocket on the API | **Durable Object `DeckSession`** (one per deck serial) at `/deck`. Same JSON protocol as `packages/deck-protocol`. |
| Database (`packages/db`) | Postgres + Drizzle | **D1 + Drizzle (sqlite dialect)**. Arrays and jsonb become JSON text columns with Zod parsing. Migrations go through `wrangler d1 migrations`. |
| Logs, diffs, artifacts | Postgres rows | **R2** bucket `greenci-artifacts`; rows keep the key. |
| Sessions, rate limits | — | **KV** `greenci-sessions`. |
| Sandbox for repair and mock CI | Docker on host | **Cloudflare Sandbox SDK** (`@cloudflare/sandbox`, on Containers). Locally it needs a container runtime, so add `SANDBOX=none` for local work until Docker, OrbStack or Colima is installed (needed from M7). Keep one interface: `Sandbox.run(cmd, {timeoutMs})`. |
| Email | SMTP + Mailpit | `EMAIL_PROVIDER=local` writes emails to D1, viewable at `/app/_emails` (dev only). `EMAIL_PROVIDER=resend` uses Resend's HTTP API in deployed environments. |
| Push | Expo push | Same: call Expo's push API from the Worker. |
| Scheduled jobs | cron in worker | **Cron Triggers** on `greenci-api`: daily summary 08:00 UTC, weekly digest Monday 08:00 UTC. |
| Mock GitHub | Node app | **Local only**, still Node (it needs real git on disk). Deployed environments always use `GITHUB_MODE=app`. |
| Secrets | `.env` | `.dev.vars` locally (gitignored, with `.dev.vars.example` committed); `wrangler secret put` per environment. |

Workers to create, each with its own `wrangler.jsonc`:

- `greenci-web`: Next.js. Talks to the API through a **service binding**, not over the public internet.
- `greenci-api`: Hono, the Durable Objects, the Workflow, queue consumers, cron, GitHub webhooks.
- `greenci-sandbox`: the Sandbox/Container class, bound to the API.

`pnpm dev` runs `wrangler dev` for each Worker (or one `wrangler dev` with multiple configs), plus `apps/mock-github` on Node, plus the deck simulator. It must work with **no Docker** when `SANDBOX=none`.

Update `docs/CODEX_PROMPT.md` §1's "done" checklist in your head: Mailpit becomes `/app/_emails`, and `docker compose` is gone. Write the remapping into `docs/decisions.md`.

## Step 3: environments on Cloudflare

Each `wrangler.jsonc` declares `env.dev`, `env.staging` and `env.production`, each with its **own** D1 database, R2 bucket, KV namespace, queue, Durable Object namespace and secrets. Names are suffixed: `greenci-dev`, `greenci-staging`, `greenci-prod`.

| Env | URL | Who can open it | GitHub |
|---|---|---|---|
| local | `localhost:3000` / `:8787` | you | mock (default) or a real dev App via smee |
| dev | `greenci-web-dev.<account>.workers.dev` or `dev.[DOMAIN]` | team, behind **Cloudflare Access** | GitHub App "GreenCI Dev" |
| staging | `staging.[DOMAIN]` | team, behind Cloudflare Access | GitHub App "GreenCI Staging" |
| production | `app.[DOMAIN]` + `[DOMAIN]` for the landing page | public | GitHub App "GreenCI" |

One GitHub App per environment, each with its webhook pointing straight at that environment's API (`/webhooks/github`). Smee is only for local.

Config: `packages/core/config` validates bindings and secrets with Zod at the start of each request. Missing config fails loudly with the variable's name.

## Step 4: CI/CD with GitHub Actions

- `ci.yml` on every PR: install, lint, typecheck, unit and integration tests (Miniflare), Playwright E2E against `wrangler dev` with `SANDBOX=none`, `AGENT_PROVIDER=fake` and `GITHUB_MODE=mock`.
- `deploy-dev.yml` on push to `main`: `wrangler d1 migrations apply --env dev --remote`, then deploy sandbox → api → web with `cloudflare/wrangler-action`. Smoke test `GET /healthz` and the landing page.
- `deploy-staging.yml`: manual (`workflow_dispatch`) or a `staging-*` tag. Same steps with `--env staging`.
- `deploy-prod.yml`: on a `v*` release tag only. Uses a GitHub **environment `production` with required reviewers**. Same steps with `--env production`, then a smoke test, and roll back with `wrangler rollback` if the smoke test fails.
- Secrets live in GitHub environments: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (per env if accounts differ). Never print them.

## Step 5: what to do now, in order

1. Step 1 (sync) and Step 2 (M0.5 re-platform). Everything green locally with no Docker.
2. **First deploy to dev**: create the dev resources (`wrangler d1 create greenci-dev`, R2, KV, queue), put their IDs in `wrangler.jsonc`, deploy the scaffold, and confirm `/healthz` and the landing page load on the dev URL. Write every command you ran into `docs/deploy.md`.
3. Add the GitHub Actions above, so later merges to `main` deploy dev automatically.
4. Continue milestones **M1–M9** from `docs/CODEX_PROMPT.md`, now on this platform. Each merged milestone auto-deploys to dev.
5. **Do not create or deploy staging or production** until a human asks in writing. Prepare their config and leave `TODO(staging)` / `TODO(prod)` where IDs go.

## What you need from me (ask once, then wait)

- Run `npx wrangler login` on this machine (a browser opens), or give me a `CLOUDFLARE_API_TOKEN` with: Workers Scripts:Edit, Workers KV:Edit, D1:Edit, Workers R2:Edit, Queues:Edit, Workflows:Edit, Containers:Edit, Account Settings:Read, and Zone/Workers Routes:Edit if we use a custom domain.
- The Cloudflare account ID.
- Whether to use a custom domain now, or `workers.dev` for dev.
- From M7: OpenAI and/or Anthropic API keys, and the GitHub App "GreenCI Dev" (follow `scripts/github-app-setup.md`, which you will write).

## Rules that still apply

- All safety guards in `AGENTS.md`. Plus: never deploy to staging or production on your own, never run remote D1 migrations against anything but dev without a human's go-ahead, and never commit `.dev.vars` or tokens.
- Commit per milestone, keep `PROGRESS.md` current, record decisions in `docs/decisions.md`.
