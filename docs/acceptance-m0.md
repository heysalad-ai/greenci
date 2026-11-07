# M0 evidence ledger

Criteria registered before implementation:

- [x] Node 22 / pnpm workspace installs reproducibly: `pnpm install --frozen-lockfile`.
- [x] Strict TypeScript, ESLint and formatting pass: `pnpm lint && pnpm typecheck`.
- [x] Configuration rejects unsafe modes; service health and OpenAPI work: `pnpm test` (nonzero tests).
- [x] Every scaffold package builds: `pnpm build`.
- [x] Host services boot and browser loads: `pnpm e2e`; browser screenshot inspected.
- [ ] Docker services become healthy and worker connects: `docker compose config --quiet`, `pnpm dev` and worker ready log.
- [ ] Each app Dockerfile builds: `docker build -f apps/<app>/Dockerfile .`.
- [x] Only GreenCI files committed; progress and known gaps recorded: `git diff --cached --stat`.

M0 is infrastructure only; this ledger does not assert any M1–M9 product journey.

## Observed on 2026-11-06

- A fresh temporary checkout of the staged files (without node_modules, .next, dist or Turbo caches) passed `corepack pnpm install --frozen-lockfile --offline` and `pnpm typecheck`, both exit 0. The temporary checkout was removed afterward.
- `corepack pnpm install --frozen-lockfile --offline`: exit 0; all 16 workspace projects resolved from the local store with no network download.
- `pnpm lint`: exit 0; ESLint and Prettier pass.
- `pnpm typecheck`: exit 0; root tests/config plus 15 workspace typechecks pass.
- `pnpm test`: exit 0; 13 tests across configuration and Fastify health/OpenAPI. This is scaffold coverage, not the M2 safety or state-machine suite.
- `pnpm build`: exit 0; all 15 workspaces build, including the Next.js 15.5.29 production shell. Empty mobile/library placeholders are counted as TypeScript builds only.
- `pnpm e2e`: exit 0; one Chromium browser test validates the shell and three HTTP liveness endpoints. The test server uses explicit host-only mode, without database or worker.
- Screenshot visually inspected: [M0 shell](evidence/m0-scaffold.png). The page is intentionally unstyled and makes no design-fidelity claim.
- Initial OpenAPI tests failed because the Swagger plugin registered after routes. Awaiting plugin registration fixed it; both API specifications now include the health response schema.
- Initial browser teardown left detached processes. Process handling and Playwright SIGTERM shutdown were corrected; final E2E exits promptly and `lsof` confirms no listener remains on 3000/4000/4001.
- `pnpm dev`: exit 1 with an explicit Docker prerequisite message. `docker` is not installed; there is no silent fallback to unsandboxed execution.
- Compose schema validation, infrastructure health, worker readiness and all Docker image builds: **not verified**, because Docker is unavailable. The full M0 startup gate remains open.
- Installation warnings: ESLint 9 is deprecated upstream (retained for the prescribed Next 15 toolchain); BullMQ brings deprecated cron-parser; optional msgpackr native build scripts are disabled. No worker execution is claimed.

M1–M9 are not implemented. Required brand files, static screens, approved PNGs and assets are missing. No live GitHub App or LLM call was made.
