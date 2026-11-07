# M4.5 acceptance and activation boundary

## Implemented and verified locally

- Zod v4 was already the direct workspace standard; the installed SDK uses Zod 4.6.7. @openai/agents and agents-extensions are pinned to 0.21.0, with matching agents-core/openai/realtime transitive versions.
- Actual Agents SDK Agent diagnosis and staged-patch repair run through deterministic Model fixtures, with no real LLM or real GitHub in tests. The real provider constructs a read-only diagnoser and a SandboxAgent with Manifest/filesystem/shell, bounded safe snapshots including AGENTS.md, input guardrails and exact staged-patch approval. No Unix-local executor is used.
- A real SDK interruption serializes into R2. The Workflow waits for an authenticated approval, reloads the exact state and resumes. Every pending tool call is shown before approval. Attempt/state/revision checks reject stale approvals; each interruption gets its own R2 key and approval record.
- Decisions has fake, current Decisions HTTP and strict Responses providers, bidirectional validation, repository prompt-cache partitioning and safe refusal/malformed-answer handling. Routing runs at the six specified points; score indices are converted to the brief's 1–5 risk scale. Repo rules store thresholds; decisions retain question, answer, probabilities and model. Fake records explicitly identify the fake provider.
- Comment commands require fresh repository write permission plus org membership, and reply using shared copy. Auto Diagnose is off by default and configurable only by an org owner; automatic repair/verify remains a separate opt-in. Runs preserve comment/auto provenance.
- The approved landing markup/assets now render, with software-only pricing, placeholder configuration, locally packaged approved fonts and a deckless onboarding entry. Authenticated web buttons, the CLI action commands and the mobile action adapter share the same API. Full M5 product-screen fidelity, full M6 CLI and Expo UI in M8 remain separate milestones.
- Browser journeys cover deckless comment Diagnose → real fixture Repair/Verify → human mock merge, and migration interruption → review proposed diff → SDK resume → verified PR, with no simulator connected. Only CSRF is stored in the browser; serialized agent state stays server-side.

## External activation still required

The live dev API remains health-only. No live OpenAI key was supplied to this run; a secure-key setup question was sent once. No model call was made. Configure OPENAI_AGENT_MODEL along with the key. If Decisions is unavailable, select DECISIONS_PROVIDER=responses; refusal/malformed data hands the run back without marking it verified.

The official Cloudflare bridge adapter and a private dev-only bridge profile are prepared. Docker is absent here; building/deploying a container bridge has not been verified. Its bearer secret and an Access-compatible server-to-server endpoint must be configured before enabling remote repair. The ordinary dev profile retains the disabled sandbox and no public bridge route; no unauthenticated shell endpoint was exposed. The Node-local selector uses Docker with networkMode=none when explicitly selected and available, otherwise the SDK fake provider.

GitHub App integration and deployed user authentication are still the M7/external setup boundary; hosted scaffold mode rejects actions. GitHub Actions deployment files are prepared, but environment credentials and production reviewer protections must be configured by the owner. No staging/production deployment, migration, resource or permission change occurred, and no PR was merged.

## Sources checked

[Sandbox agents](https://openai.github.io/openai-agents-js/guides/sandbox-agents/), [sandbox clients](https://openai.github.io/openai-agents-js/guides/sandbox-agents/clients/), [human approval](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/), [tool guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/), [Decisions API](https://developers.openai.com/api/docs/guides/decisions), and the installed 0.21.0 declaration files were checked before integration. The current Decisions guide describes general availability, superseding the supplied brief's preview note; openai 7.2.0 has no typed Decisions resource, so that provider uses fetch.

## Final verification ledger

`pnpm lint` and `pnpm typecheck` pass. `pnpm test:core` reports 100% statements/branches/functions/lines over all core source files. `pnpm test` passes 47 tests in ten files, including real workerd/D1/R2/Workflow integrations. `pnpm build` succeeds for all 18 packages. `pnpm e2e` passes seven browser tests, including deckless human mock merge and pre-execution SDK approval. `pnpm --filter @greenci/web build:worker --env dev` builds the deployable OpenNext Worker. The UI detector returns no findings, and desktop/mobile screenshots were inspected against the supplied reference.

The updated dev API/web deployments and authenticated service-binding health/landing smoke also pass; anonymous public requests still redirect to Access. See docs/deploy.md for version IDs and exact commands. This hosted proof covers the preview/health profile, not live model or customer-code execution.
