# Codex build prompt: GreenCI, end to end, local first

Paste everything below the line into Codex, run from the root of this repository.

---

You are building **GreenCI** from scratch in this repository: a physical command deck for AI coding agents. The deck has one command key and three green action keys, **Diagnose**, **Repair** and **Verify**. When a GitHub CI check fails, the person presses Diagnose. GreenCI finds the cause, writes a fix on its own branch, re-runs every check on that fix, and only then opens a pull request for a human to review.

The whole product must run **end to end on one laptop** first. Later it moves to dev, then staging, then prod. That later move is not your job now, but nothing you build may block it.

## 0. Read these first, in this order

1. `AGENTS.md`: the working rules for this repo.
2. `design-system/BRAND.md`: the brand book (colour, type, voice, iconography, motion).
3. `design-system/tokens.json`, `design-system/tokens.css`, `design-system/components.css`: the design tokens and the reference CSS for every component.
4. `design-system/components/*/README.md` and `preview.html`: one folder per component (Button, ActionKey, StatusChip, Toast, Banner, RunCard, CommandField, Terminal, Logo, Mascot).
5. `design/screens/*.png`: the approved screens. `design/static/*.html` is the same screens as plain HTML you can open in a browser and copy exact markup, spacing and copy from. `design/boards/*.dc.html` are the editable sources; ignore their runtime tags.
6. `design-system/assets/`: the logos and the seven key mood faces. Use these files; never redraw them.

The screens are the spec. When this prompt and a screen disagree on visuals or copy, the screen wins. When they disagree on behaviour or safety, this prompt wins.

## 1. What "done" means

From a clean clone, with only Docker and Node 22 installed:

```bash
cp .env.example .env
pnpm install
pnpm dev          # or: make dev
```

That starts everything locally. After the first install and Docker image pulls, no internet is needed (fonts fall back cleanly). Then this journey works in a browser, a terminal and a phone simulator:

1. Open `http://localhost:3000`. Landing page as in `design/screens/Landing.png`.
2. Sign in (local mode: a seeded user "Chilu" via the mock GitHub). The four onboarding screens from `Onboarding.png`: plug in the deck (the **deck simulator** stands in for hardware), connect GitHub, pick repos, first fix.
3. The seeded practice repo `greenci/practice` has one failing check, `test: adds tax correctly` (rounding before summing). The Diagnose key on the simulator breathes orange.
4. Press **Diagnose** on the simulator (or key `2`, or the button in the app). The run view (`WebRun.png`) shows live progress over SSE. Diagnosis appears with cause, file and line.
5. Press **Repair**. A real diff is produced on branch `greenci/fix-<runId>` in the mock GitHub.
6. Press **Verify**. Checks re-run (mock CI runs the repo's test command for real inside a sandbox), progress fills, then a PR opens.
7. Merge the PR in the mock GitHub UI or API. The keys flash green once; toast "Green again"; "First fix merged" email lands in Mailpit (`http://localhost:8025`).
8. `greenci status`, `greenci diagnose`, `greenci repair` and `greenci verify` in a terminal do the same and print exactly the format in `CLI.png`.
9. The Expo app (`apps/mobile`) shows Home, Live run and Needs you (`MobileHome.png`, `MobileRun.png`, `MobileApprove.png`) against the local API.
10. A second seeded repo `acme/ledger` produces a fix touching `db/migrations/`. It stops at **Needs you**: the command key glows amber, the phone shows the approval screen, and nothing opens until a person approves.
11. `pnpm test` and `pnpm e2e` pass. The Playwright journey above is automated.

The same code must also run against a **real GitHub App** with `GITHUB_MODE=app` (section 6), tested against a real practice repo.

## 2. Stack (do not substitute)

- **Monorepo:** pnpm workspaces + Turborepo. TypeScript `strict` everywhere. Node 22. ESLint + Prettier. Vitest. Playwright.
- **apps/web:** Next.js 15 (App Router, React 19). Styling from `design-system/tokens.css` + CSS Modules. **No Tailwind, no component library, no new colours.** Every colour, size, radius and shadow comes from a token.
- **apps/api:** Fastify 5. REST + Server-Sent Events. GitHub webhook receiver. Zod for every request and response schema. OpenAPI generated from the Zod schemas.
- **apps/worker:** BullMQ on Redis. Runs the agent jobs.
- **apps/mock-github:** a small Fastify server that implements the subset of the GitHub REST API and webhooks GreenCI uses (section 6), backed by real local git repos, with a minimal HTML UI to view and merge PRs.
- **apps/mobile:** Expo SDK (latest stable) + expo-router. Uses `packages/tokens` (TS export of the same tokens).
- **packages/ui:** React components that match `design-system/components/*` exactly, used by web. Same class names and states as `components.css`.
- **packages/tokens:** build step that turns `design-system/tokens.json` into CSS variables (identical to `tokens.css`) and a typed TS object for mobile and email.
- **packages/core:** domain types, run state machine, safety guards, notification policy, copy strings. Pure TypeScript, no I/O, heavily unit-tested.
- **packages/db:** Postgres 16 + Drizzle ORM, migrations, seed.
- **packages/agent:** the agent runtime (section 5).
- **packages/github:** one `GitHubClient` interface with two implementations: Octokit (real App) and mock.
- **packages/deck-protocol:** message schema between host and deck (section 7).
- **packages/cli:** the `greenci` CLI (commander). Published bin name `greenci`.
- **packages/email:** React Email templates, sent over SMTP to Mailpit locally.
- **Infra:** `docker-compose.yml` with postgres, redis and mailpit (the Node apps, including mock-github, run on the host under `pnpm dev`). `Makefile` with `dev`, `test`, `e2e`, `seed`, `reset`. Each app has a Dockerfile, so dev/staging/prod later is a config change.

## 3. Domain model

Tables (Drizzle), with `created_at`/`updated_at` on all of them:

- `users` (github_id, login, name, avatar_url)
- `orgs` (github account), `memberships` (user, org, role: owner|member)
- `installations` (github installation id, org)
- `repos` (org, full_name, default_branch, watched bool, test_command nullable)
- `repo_rules` (repo, protected_paths text[], page_me_branches text[], max_diff_lines int default 200, auto_open_pr bool default true)
- `decks` (org, user, serial e.g. `GC-1`, firmware, last_seen_at, status online|offline)
- `runs` (repo, head_sha, branch, failing_check_name, state, cause_summary, cause_file, cause_line, confidence, fix_branch, pr_number, attempts, started_by: deck|web|cli|mobile|auto)
- `run_events` (run, type, payload jsonb, at) is an append-only log; every state change writes one.
- `checks` (run, phase: original|verify, name, status queued|running|passed|failed, duration_ms, log_excerpt)
- `fixes` (run, attempt, diff text, files_changed, additions, deletions, touches_protected bool)
- `approvals` (run, requested_reason, decided_by, decision approve|changes|take_over, decided_at)
- `notifications` (user, run, channel push|email|toast, kind, sent_at, suppressed_reason)
- `push_tokens` (user, expo token)

## 4. The run state machine (packages/core)

States, exactly these names, shown to people with the words in `BRAND.md`:

`failing → diagnosing → diagnosed → repairing → repaired → verifying → (needs_you →) pr_open → merged`

plus the exits `not_verified → handed_back`, `out_of_scope → handed_back`, `stopped`.

Rules:

- `diagnose` is allowed from `failing`. `repair` from `diagnosed` or `not_verified` (that's a retry; at most 3 attempts). `verify` from `repaired`.
- After verify, if all checks pass and the fix touches a protected path, or the diff is over `max_diff_lines`, the run goes to `needs_you`. Otherwise it goes to `pr_open` (if `auto_open_pr`) or waits for "Open fix PR".
- If verify fails only on checks that also fail on the default branch head, mark them "likely unrelated" in the event payload. That's still `not_verified`; say so honestly (see the States board).
- `out_of_scope`: the cause is CI configuration, secrets or infrastructure. Hand back with exact instructions; never attempt a fix.
- Every transition is a pure function `transition(run, event) → {run, effects[]}`. Effects (enqueue job, publish event, notify, set deck lights) are executed by the caller. Unit-test every edge, including illegal ones.

**Safety guards (non-negotiable, unit-tested, enforced in packages/github too):**

1. Push only to branches matching `greenci/*`. Any other ref throws.
2. Never merge a PR. Never approve a PR.
3. Never read, print or write repository/organisation secrets or `.env*` files. Strip them from agent context.
4. Never modify `.github/workflows/**` unless the repo rule allows it, and even then route to `needs_you`.
5. Never claim "verified" unless every verify-phase check has status `passed`.
6. Redact tokens in logs.

## 5. The agent (packages/agent)

An `AgentProvider` interface with three implementations, chosen by `AGENT_PROVIDER`:

- `fake`: deterministic and scripted from fixtures; the default for tests and for the seeded demo repos, so the journey works offline.
- `openai`: OpenAI Responses API with tool calls. Model from `OPENAI_MODEL`.
- `anthropic`: Anthropic Messages API with tool use. Model from `ANTHROPIC_MODEL`.

Phases:

- **Diagnose.** Input: failing check name, log (trimmed to the failing step, ±200 lines), repo tree, and files referenced in the stack trace. Output (Zod-validated JSON): `{summary, file, line, confidence: high|medium|low, category: code|test|dependency|config|flaky|infra, notAProductBug: bool, evidence: string[]}`. One-line summary in the voice of `BRAND.md` (fact first, no hype).
- **Repair.** Works in a sandbox: clone into a temp dir (`WORK_DIR`), and run commands only inside a Docker container (`node:22`, `python:3.12` by detection) with network off and a CPU/time limit. Tools: `read_file`, `list_dir`, `search`, `apply_patch` (unified diff), `run(cmd)` (whitelisted to the repo's test command and the package manager). Produces the smallest diff, then runs the failing test locally before returning. Commits as `greenci[bot]` with message `fix: <summary> (greenci run <id>)` and pushes `greenci/fix-<runId>`.
- **Verify.** Triggers CI on the fix branch: real GitHub checks in app mode, mock CI in mock mode (runs the repo's `test_command` in the same sandbox and reports check runs). Streams per-check progress.

The PR body is exactly the shape in `design/screens/Copy.png` ("Why this failed / What changed / Verified / Fixed with GreenCI · run N"), with reviewers from CODEOWNERS when present.

## 6. GitHub

`GitHubClient` covers only: list installations/repos, get check runs and suites for a SHA, download job logs, get file contents and tree, create branch from SHA, push commits (via git over HTTPS with the installation token in app mode, a local bare repo in mock mode), create PR, get PR status, read CODEOWNERS, and receive webhooks for `check_run`, `check_suite`, `workflow_run`, `pull_request`, `installation`.

- **mock mode (default locally):** `apps/mock-github` keeps real bare git repos under `.data/mock-github/`. It is seeded with `greenci/practice` (a tiny TS package whose `addTax` rounds before summing, plus a Vitest test that fails), `acme/payments` (a fixture date that expired on 2026-11-01, matching `WebRun.png`), `acme/ledger` (a migration fix that must hit `needs_you`), `acme/web` and `acme/agent` (passing). It runs "CI" by executing the repo's test command in Docker, posts check runs, and sends signed webhooks to the API exactly like GitHub does. Run the API, worker and mock-github on the host via `pnpm dev` (only postgres, redis and mailpit in compose), so they can reach the local Docker daemon without mounting the socket. With `SANDBOX=none`, commands run directly in the temp dir; that mode is for CI of this repo only.
- **app mode:** a real GitHub App. Permissions: checks:read, actions:read, contents:write, pull_requests:write, metadata:read. Webhooks are forwarded to localhost with smee (`SMEE_URL`). Add `scripts/github-app-setup.md` with click-by-click setup, and a `pnpm github:verify` command that checks the credentials and lists installations.

## 7. The deck: simulator now, hardware later

`packages/deck-protocol` defines JSON messages over WebSocket at `ws://localhost:4000/deck`:

- device → host: `hello {serial, firmware}`, `key {key: "command"|"diagnose"|"repair"|"verify", action: "press"|"long_press"}`, `heartbeat`
- host → device: `lights {key, mode: "off"|"idle"|"breathe"|"sweep"|"steady"|"flash"|"fill", color: "orange"|"blue"|"amber"|"green", progress?: 0..1}`, `face {mood}` (for decks with a screen later)

Light mapping (from `States.png` and `Deck.png`): failing = Diagnose breathes orange; diagnosing/repairing = that key's ring sweeps blue; verifying = Verify's ring fills with progress; needs_you = command key steady amber, and a long press approves; passing = all three flash green once; idle = soft green.

- `apps/web` route `/deck` and `pnpm deck:sim` render the deck with the `ActionKey` component, connect as a device, and map keys `1`–`4`. The simulator is a first-class client used in E2E.
- `apps/deck-bridge`: a stub that will talk to real hardware over USB HID/serial and relay the same protocol. Write the interface and a README; implementing firmware is out of scope.

## 8. Surfaces and the exact screens they must match

| Surface | Screen | Notes |
|---|---|---|
| Landing `/` | `Landing.png` | Prices, dates and quotes stay `[PLACEHOLDER]` and come from one config file. |
| Onboarding `/start` | `Onboarding.png` | Four steps; the practice repo is pre-selected. |
| Dashboard `/app` | `WebDashboard.png` | Light and dark (`data-theme`). Live via SSE. Filters: All / Needs you / Failing. |
| Run detail `/app/runs/:id` | `WebRun.png` | Three phase cards, on-screen deck in sync with the real/simulated deck. |
| States catalogue `/app/_states` (dev only) | `States.png` | Renders every state, error, toast and empty state from fixtures; used for visual tests. |
| CLI | `CLI.png` | Glyphs `● ◐ ✔ ✕ ?`, every block ends with `Next:`, under 80 columns, no emoji, `NO_COLOR` respected. Device-flow login against the local API. Commands: `login, status, diagnose [repo], repair [--retry], verify, diff, handoff, doctor, watch`. |
| Mobile | `MobileHome.png`, `MobileRun.png`, `MobileApprove.png`, `MobileNotify.png` | Expo push in dev builds; in Expo Go, fall back to in-app banners. |
| Email | `Emails.png` | Templates: deck shipped, first fix merged, weekly digest, card declined. Subject lines exactly as shown. |

Copy: take strings verbatim from `design/static/*.html`. Put every user-facing string in `packages/core/src/copy.ts` so the web, mobile, CLI and email all say the same thing.

Notifications policy (`packages/core`): push only for `failing` on a watched branch and for `needs_you`. Quiet hours 22:00–07:00 local unless the branch is in `page_me_branches`. Successes are batched into a daily summary. Toasts in the web app for every phase change. Tests cover the policy.

## 9. Design fidelity rules

- Import `design-system/tokens.css` and `components.css` once, globally, in web. Build `packages/ui` components on those classes (`gc-btn`, `gc-key`, `gc-chip`, `gc-toast`, `gc-run`, `gc-banner`, `gc-cmd`, `gc-term`); don't restyle them.
- Fonts: Bricolage Grotesque (display), Geist (text), Geist Mono (code), via `next/font/google`, with the fallback stacks in `tokens.json`.
- Use the mood SVGs for the key face everywhere a face appears; map run state → mood in `packages/core` (`failing→key-failing`, `diagnosing→key-diagnosing`, and so on; `pr_open→key-passing`, `merged→key-shipped`, `needs_you→key-ready`).
- No gradients, no emoji in UI, no new colours, no Tailwind default greys. Every interactive element has the 2px `focus` ring. Respect `prefers-reduced-motion`. Text contrast ≥ 4.5:1 in both themes.
- After each surface is built, take a Playwright screenshot at the screen's size and put it side by side with the PNG in `design/screens` in `docs/fidelity/<surface>.md`. Fix differences in layout, spacing, type and copy before moving on.

## 10. Environments

- One config module (`packages/core/config`) reads `APP_ENV=local|dev|staging|prod` and validates every variable with Zod at boot. Only `local` must work now; the others exist as typed stubs with `TODO(deploy)`.
- `.env.example` lists every variable with a safe local default: `DATABASE_URL, REDIS_URL, GITHUB_MODE, GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, GITHUB_WEBHOOK_SECRET, SMEE_URL, AGENT_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, SMTP_URL, WEB_URL, API_URL, WORK_DIR, SANDBOX=docker|none`.
- Never commit secrets. `.env` and `.data/` are gitignored.

## 11. Milestones (commit at the end of each; keep `PROGRESS.md` updated)

- **M0 Scaffold:** monorepo, tooling, docker-compose, `pnpm dev` starts empty apps, CI workflow (lint, typecheck, unit tests) for this repo.
- **M1 Tokens + UI:** `packages/tokens`, `packages/ui` with every component, and a `/app/_ui` page showing them next to `design-system/components/*/preview.html`.
- **M2 Core:** state machine, safety guards, notification policy, copy. 100% branch coverage on `packages/core`.
- **M3 Data + mock GitHub:** schema, migrations, seed matching the screens' sample data, mock-github with real git repos, mock CI, signed webhooks.
- **M4 API + worker + fake agent:** webhooks → runs; diagnose/repair/verify jobs; SSE events; full journey works by API with `AGENT_PROVIDER=fake`.
- **M5 Web:** onboarding, dashboard, run detail, states catalogue, deck simulator. Fidelity pass.
- **M6 CLI:** all commands, device login, snapshot tests of output.
- **M7 Real agent + sandbox:** OpenAI and Anthropic providers, Docker sandbox, real diffs on the seeded repos, then a real GitHub App against a real practice repo.
- **M8 Mobile + email + notifications:** Expo app, push, Mailpit emails, digest job.
- **M9 E2E + hardening:** Playwright journey (section 1), the `acme/ledger` needs-you journey, the honest-miss journey, the out-of-scope journey, error states from `States.png` (deck offline, GitHub access expired, rate limit, card declined), `make reset`, README quick start.

## 12. Tests you must write

- Unit: state machine (every legal and illegal transition), safety guards (attempt to push `main`, touch secrets, edit workflows), notification policy (quiet hours, page-me, batching), CLI formatters (snapshots), copy completeness.
- Integration (API + worker + mock GitHub + fake agent): the four journeys end to end via HTTP and webhooks.
- E2E (Playwright): onboarding → simulator Diagnose/Repair/Verify → PR → merge → toast + Mailpit email. Then the needs-you approval from the web, and from a long press on the simulator's command key.
- Visual: Playwright screenshots of `/app/_states`, dashboard and run detail in light and dark, committed as baselines after your fidelity pass.

## 13. Working style

- Work milestone by milestone. At the end of each: run `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm e2e` from M5), fix everything, update `PROGRESS.md` with what's done, what's next and any decision you made, then commit with a conventional commit message.
- If something in this prompt is impossible or ambiguous, choose the simplest option that keeps the safety guards and the screens intact, write the decision in `docs/decisions.md`, and keep going. Don't stop to ask.
- Never call a real LLM or real GitHub in tests. Never push to a real repo's default branch, ever.
- When you finish M9, write `docs/next-dev-staging-prod.md`: what changes for each environment (hosting choice options, secrets management, GitHub App per environment, database migrations, observability), without implementing it.

Start with M0 now.
