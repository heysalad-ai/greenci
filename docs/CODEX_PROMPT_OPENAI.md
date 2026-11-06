# Codex brief: OpenAI Agents SDK, Decisions API, and GreenCI without a deck

Paste everything below the line into Codex. This brief **overrides §5 (the agent)** of `docs/CODEX_PROMPT.md` and adds a deckless mode. The Cloudflare brief, the screens, the state machine and the safety guards still apply.

---

## A. The agent runs on the OpenAI Agents SDK

- Use `@openai/agents` pinned to the current 0.21.x release, with every `@openai/agents-*` package on the **same version**. The SDK needs **Zod v4**, so move the repo to Zod v4 first.
- Before writing code, read the current docs at https://openai.github.io/openai-agents-js and the Sandbox Agents guide. Check import paths and constructor options there. Don't guess. Write what you used into `docs/decisions.md`.
- Replace `packages/agent`'s home-grown loop with the SDK. Keep the `AgentProvider` interface so `fake` still works offline in tests. `openai` now means the Agents SDK. Keep `anthropic` behind the same interface only if it stays cheap to maintain; otherwise note in `docs/decisions.md` that it was removed.

Agents:

| Agent | Type | Output |
|---|---|---|
| `diagnoser` | `Agent` with read-only tools: `get_check_log`, `read_file`, `search_repo` | The Zod `Diagnosis` schema from §5, as structured output |
| `repairer` | `SandboxAgent` with `filesystem()` and `shell()` capabilities, and a `Manifest` that seeds the repo checkout plus `AGENTS.md` (repo rules and the safety guards) | A diff, plus a local run of the failing test |
| `verifier` | Plain code, not an LLM: triggers CI and reads check results. Never let a model decide that checks passed. | |

Wiring:

- **Sandbox.** In deployed environments, run the `repairer` with the SDK's **Cloudflare sandbox client** (it talks to a deployed bridge Worker; deploy that as `greenci-sandbox`). Locally, use the Docker client when Docker is present, and fall back to `fake` when it isn't. Never use the unisolated Unix-local client on customer code.
- **Needs you.** Use the SDK's human-in-the-loop support. Tools that write a file under `protected_paths`, or that push a diff larger than `max_diff_lines`, get `needsApproval`. When the run is interrupted, save the serialized `RunState` to **R2** (never the browser, because it isn't authenticated), move the run to `needs_you`, and have the Cloudflare Workflow `waitForEvent('approval')`. On approve, load the `RunState`, approve the interruption and resume. Approvals count toward `maxTurns`, so set it deliberately.
- **Safety guards as tool guardrails.** Every git and file tool goes through a tool guardrail that enforces `AGENTS.md`: push only to `greenci/*`, never touch secrets or `.env*`, never edit workflows without approval. Remember that handoffs and hosted tools skip tool guardrails, so don't rely on them for safety. The `packages/github` checks stay as the last line of defence.
- **Tracing.** Tracing stays on, with `traceIncludeSensitiveData: false`, so customer code and logs don't leave in traces. Put each run's trace ID on the `runs` row.

## B. Fast decisions use the OpenAI Decisions API

The Decisions API (`POST /v1/decisions`) asks many `predicate`, `choice` or `score` questions about one input and returns **probabilities**, not prose. It's cheap and fast, so use it for every routing call, and keep the Agents SDK for the real work.

Add `packages/decisions` with one function, `decide(input, questions) → answers`. It uses Zod to validate both directions, and three providers chosen by `DECISIONS_PROVIDER`:

- `openai`: calls `/v1/decisions` with `fetch` (check whether the `openai` Node SDK now has a typed method and use it if so). Model from `DECISIONS_MODEL`.
- `responses`: a fallback for accounts without access (the API is in limited preview). It calls the Responses API with a strict JSON schema on the same model and maps the result to the same shape, with `confidence: null`.
- `fake`: fixtures for tests.

Use it at exactly these points. Probability thresholds live in `repo_rules` with these defaults:

| When | Question | Type | Effect |
|---|---|---|---|
| A check fails | “Is this failure caused by CI config, secrets or infrastructure, not code?” | predicate | ≥ 0.7 → `out_of_scope`, hand back with instructions; never start Repair |
| A check fails | Category: code, test, dependency, config, flaky, infra | choice | Sets `diagnosis.category`; seeds the diagnoser's prompt |
| A check fails | “Did this exact check fail the same way on the default branch in the last 7 days?”, given the history | predicate | ≥ 0.6 → mark “likely flaky” and ask before repairing |
| After Repair | Risk of this diff, 1–5 | score | ≥ 4 → `needs_you`, even if no protected path changed |
| After Verify fails | “Is the remaining failure unrelated to this fix?” | predicate | Feeds the honest-miss copy (“likely unrelated”) |
| Before notifying | Urgency: page now, toast, or digest | choice | Combined with the notification policy; the policy wins on quiet hours |

Rules:

- Decisions **never** override the safety guards, and never mark a fix as verified.
- Refusals and malformed answers fall back to the safe path: hand back to a person.
- Store every decision (question, answer, probabilities, model) in a `decisions` table, linked to the run, and show them on the run detail page under “Why GreenCI chose this”.
- Use `prompt_cache_key` per repo so repeated questions on the same repo are cached.

## C. GreenCI works with or without the deck

The deck is the best way to use GreenCI, not the only way. Everyone gets the full product in software, and the deck adds the physical keys.

- Every action the keys trigger is also available from:
  - the web app's on-screen deck (the run detail already shows one),
  - the CLI,
  - the mobile app,
  - a **PR or commit comment command**: `/greenci diagnose`, `/greenci repair`, `/greenci verify`, `/greenci approve`. Only users with write access to the repo can run them, and GreenCI replies in the thread using the copy in `packages/core/src/copy.ts`,
  - **auto mode** per repo (off by default): Diagnose starts on its own when a watched check fails. Repair and Verify still need a press or a command unless the repo enables auto-repair.
- Onboarding: step 1 (plug in the deck) gets a **“No deck yet? Continue without it”** link. Deckless users go straight to GitHub, and the dashboard's deck panel becomes the on-screen deck with a small “Get the deck” link.
- `started_by` gains `comment` and `auto`. Deck lights still update when a deck is connected, whatever started the run.
- Pricing on the landing page gets a software-only plan, with `[PRICE]` placeholders. Copy: “Works without the deck. Better with it.”
- E2E: add a deckless journey. A new user skips the deck, the practice repo fails, `/greenci diagnose` is posted on the mock PR, and the run goes through to a merged PR without the simulator connected.

## D. Order of work

Do this as a new milestone, **M4.5**, right after the API, worker and fake agent are working on Cloudflare (Cloudflare brief M0.5, then M1–M4):

1. Zod v4 migration.
2. `packages/decisions` with all three providers, plus tests.
3. The Agents SDK `diagnoser` and `repairer`, with the `fake` provider still the default in tests.
4. `needsApproval` → R2 `RunState` → Workflow wait → resume, tested end to end with `acme/ledger`.
5. Deckless entry points: comment commands, auto mode, the onboarding skip.

Environment variables to add to `.dev.vars.example` and to Zod config: `OPENAI_API_KEY`, `OPENAI_AGENT_MODEL`, `DECISIONS_PROVIDER=fake`, `DECISIONS_MODEL`, `SANDBOX_CLIENT=fake|docker|cloudflare`.

When you need an OpenAI key, or the Decisions API returns “not enabled for this user”, ask me once, set `DECISIONS_PROVIDER=responses` and keep going.
