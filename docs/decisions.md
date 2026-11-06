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
