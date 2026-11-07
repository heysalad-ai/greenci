# First dev deployment — workers.dev

Authorized scope: deploy GreenCI dev only, using the HeySalad account's workers.dev subdomain. Staging and production must remain unchanged. This deployment publishes the M0.5 scaffold, not the agent product.

## Proof registered before deployment

- [x] Existing Wrangler identity/account verified; login only if required.
- [x] Dev-only scaffold mode reports honest health without fake integration credentials; all action/probe routes remain disabled remotely.
- [x] Automated tests reject scaffold mode in staging/production and verify dev health with real Miniflare bindings.
- [x] Local lint/typecheck/tests/build and browser journey pass.
- [x] Only dev D1, KV, R2, queue and Worker/DO/Workflow resources created; dev migration applied remotely.
- [x] Cloudflare Access protects the dev hostname(s), as required by the platform brief.
- [x] Deploy sandbox → API → web using --env dev, with previews disabled.
- [x] Live /healthz and landing page pass HTTP and browser checks; anonymous access is checked separately from authenticated health.
- [x] Record resources, versions, commands, verification and limitations; commit changes and update PR #1.

## Authentication and inventory

- `corepack pnpm exec wrangler whoami`: already authenticated using Wrangler OAuth. Account HeySalad Inc., ID `67a17ada4efeee4480283035cc0c5f90`. No login needed; the unrelated missing K2 scopes are not needed for this deployment.
- `corepack pnpm exec wrangler d1 list --json`
- `corepack pnpm exec wrangler r2 bucket list`
- `corepack pnpm exec wrangler kv namespace list`
- `corepack pnpm exec wrangler queues list`
- `corepack pnpm exec wrangler deployments list --name greenci-web-dev --env dev --config apps/web/wrangler.jsonc`: Worker does not yet exist.
- Account Workers subdomain API: `heysalad-o.workers.dev`.
- Read-only Access app inventory and organization checks: organization lookup returned 403; individual Access-app capability is being checked before public routes are enabled.

For Cloudflare API operations not exposed by Wrangler, an ignored local helper delegates credential retrieval to Wrangler and passes credentials directly into authenticated requests in-process. Tokens are never printed, persisted, or committed. Only selected non-secret results and status are recorded here.

## Final state

Dev scaffold is live on [greenci-web-dev.heysalad-o.workers.dev](https://greenci-web-dev.heysalad-o.workers.dev/). API health: [greenci-api-dev.heysalad-o.workers.dev/healthz](https://greenci-api-dev.heysalad-o.workers.dev/healthz). Both require Cloudflare account membership through Cloudflare Access, with all-traffic policies and a 24-hour session. Preview URLs remain disabled. The sandbox has no public route.

These are the M0.5 scaffold pages and health endpoints. They are not the approved M1 landing design or a working agent fix journey. `SCAFFOLD_ONLY=true` is permitted only in dev with the fake agent provider: only GET /health and /healthz are exposed by the API, all action/probe routes return 404, and responses explicitly report integrations disabled. Staging and production reject this mode. Missing provider credentials still fail normal integration mode. No placeholder credentials were created to make health pass.

The initial auth blocker was resolved without user interaction: Wrangler OAuth cannot modify Access applications (403), but the existing Chrome HeySalad profile was authenticated to the dashboard. The unnecessary in-app Google sign-in was closed. No new Wrangler login, new API token, password entry or new billing plan was needed. The earlier sign-in request no longer needs an answer.

## Dev resources

| Resource        | Name / ID                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------ |
| Account         | HeySalad Inc. — 67a17ada4efeee4480283035cc0c5f90                                           |
| D1              | greenci-dev — 0a86beee-5572-4196-a05a-f48506639f38, WEUR                                   |
| R2              | greenci-artifacts-dev, WEUR                                                                |
| KV              | dev-greenci-sessions-dev — 076867b570c94b75a40324e3c2b1b912 (Wrangler adds the dev prefix) |
| Queue           | greenci-events-dev                                                                         |
| Workflow        | greenci-runs-dev, RunWorkflow                                                              |
| Durable Objects | OrgRoom and DeckSession, scoped to greenci-api-dev                                         |
| Web Access app  | b1d1fddd-8c35-45e3-8a69-6f23ce23a704                                                       |
| API Access app  | 416142d6-a5b0-4c6f-bf8c-f10593e85dbd                                                       |

## Deployed versions

| Worker              | Active version                       | Routing                                  |
| ------------------- | ------------------------------------ | ---------------------------------------- |
| greenci-sandbox-dev | fc572eb4-fcc4-4961-8d83-17feab10b80b | Service binding only; execution disabled |
| greenci-api-dev     | 4089cfdf-1b47-48b4-8969-46dc0dfda491 | workers.dev, Access protected            |
| greenci-web-dev     | 51f26431-2097-41fc-89fa-4151f6bd3290 | workers.dev, Access protected            |

Initial private API/web versions were 10ad4c4a-f7d4-4352-9513-5ad13faa020e and 170b4a92-19b8-42ac-8e29-ca29fb50f0ae. Their routing was disabled until the Access policies were visibly confirmed in the dashboard. The later versions enable only the protected dev URLs.

Cloudflare's dashboard uses an internal “Production” service label even for separately named Workers such as greenci-web-dev. All actual deployment commands used `--env dev`, all deployed names end in `-dev`, and APP_ENV is dev. No GreenCI staging/production Worker, resource, migration or route was created or changed. No account-wide Access setting or policy for another application was changed.

## Commands executed

From the repository root; all provisioning and deployment targeted the explicit dev profile:

```sh
corepack pnpm exec wrangler d1 create greenci-dev --location weur --config apps/api/wrangler.jsonc --env dev --update-config=false
corepack pnpm exec wrangler r2 bucket create greenci-artifacts-dev --location weur --config apps/api/wrangler.jsonc --env dev --update-config=false
corepack pnpm exec wrangler kv namespace create greenci-sessions-dev --config apps/api/wrangler.jsonc --env dev --binding SESSIONS --update-config=false
corepack pnpm exec wrangler queues create greenci-events-dev --config apps/api/wrangler.jsonc --env dev
corepack pnpm exec wrangler d1 migrations apply greenci-dev --config apps/api/wrangler.jsonc --env dev --remote
corepack pnpm exec wrangler deploy --config apps/sandbox/wrangler.jsonc --env dev
corepack pnpm exec wrangler deploy --config apps/api/wrangler.jsonc --env dev
corepack pnpm --filter @greenci/web build:worker --env dev
corepack pnpm exec wrangler deploy --config apps/web/wrangler.jsonc --env dev
```

After Access was applied in Chrome, set env.dev.workers_dev=true for API/web (sandbox stays false), then ran the API and web deploy commands above once more. No source changes were made between the private and protected public builds except that routing flag. The dev cron list is empty until notification jobs are implemented.

API operations through the ignored local Wrangler-authenticated helper, with no credential output:

- GET /accounts/{account}/workers/subdomain — read the existing heysalad-o subdomain; did not change it.
- GET /accounts/{account}/access/organizations — 403.
- GET /accounts/{account}/access/apps — the restricted OAuth view was empty; it did not prove the account had no Access configuration.
- POST /accounts/{account}/access/apps, proposed hostname-based dev owner policy — 403, no app created.
- GET /accounts/{account}/workers/scripts?per_page=100 — selected only new GreenCI Worker IDs/tags.
- POST /accounts/{account}/access/apps, proposed dev API Worker-based owner policy — 403, no app created.
- GET /accounts/{account}/workers/scripts/greenci-api-dev/subdomain and the matching web path — confirmed enabled=false and previews_enabled=false before activation.

Dashboard operations on the two dev Workers only: Workers & Pages → greenci-web-dev → Access → Protect this Worker → All traffic → Cloudflare account → Apply Access. Verified “Worker Access All traffic” and “Cloudflare account members Allow”. Repeated for greenci-api-dev, attaching that same account-member policy. Existing Chrome authentication supplied the required Access administration capability; no account-wide switch was used.

## Verification commands and observations

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm e2e
corepack pnpm exec wrangler dev --config .data/dev-smoke-wrangler.jsonc --ip 127.0.0.1 --port 8799 --inspector-port 9249
curl --max-time 20 -fsS http://127.0.0.1:8799/api/healthz
curl --max-time 20 -fsS http://127.0.0.1:8799/healthz
curl --max-time 20 -fsS http://127.0.0.1:8799/
corepack pnpm exec playwright screenshot --viewport-size='1280,720' --wait-for-timeout=1000 http://127.0.0.1:8799/ docs/evidence/dev-landing.png
```

Lint/typecheck pass, 22 tests pass (8 Miniflare integration tests), 16 workspace builds pass, and 3 browser tests pass. A test first reproduced dev health returning 503 without integration credentials, then passed after the explicit health-only dev mode was added. It also checks that action routes and POST health are rejected.

The ignored smoke Worker ran locally and used `remote:true` service bindings to the actual deployed dev Workers. It was not another public deployment. Remote API health returned 200 and exercised D1, KV, R2 and the disabled sandbox service. Web health returned 200 through the web→API service binding; the root page returned 200 with the GreenCI heading. Remote action/probe routes returned 404. See [private smoke results](evidence/dev-private-smoke.json).

After protected routing was enabled, anonymous HTTPS requests to the actual web root and API /healthz returned 302 to heysalad.cloudflareaccess.com, never an unauthenticated application response. In the existing Chrome session, selected “Cloudflare account members” sign-in and verified the API JSON directly at the real workers.dev URL. The root page then loaded directly at its real URL, and the Service health link showed the web→API health JSON. The verified dev root was left open in Chrome. See [live observations](evidence/dev-live-smoke.json) and [deployed-page capture](evidence/dev-landing.png). The capture uses the authenticated remote service-binding probe without exporting browser cookies.

## Remaining milestones

The dev deployment is complete for the scaffold. Agent execution and provider integrations remain disabled. GitHub Actions deployment automation is the next separate step; no long-lived CI credential was created. Before enabling remote WebSockets in M4, replace the current Worker-level Access policy with a hostname-based policy, since [Worker-level Access does not support WebSocket upgrades](https://developers.cloudflare.com/workers/configuration/cloudflare-access/). Local socket tests are unaffected. Sandbox containers and real providers remain M7 work. Staging/production require a later explicit written instruction.

## 2026-11-07 — M1–M4.5 code and landing update (dev only)

Built and tested the local SDK/fake workflows, then updated the same dev API/web Workers. The existing sandbox was not redeployed: its disabled profile remains active. The container bridge profile was prepared but not activated. Deployed source: cdc04176465306f0a2e02bcc59e9cb6a9a90fcc1; the later evidence/smoke-script commit does not change Worker runtime code.

Commands executed from the repository root:

```sh
corepack pnpm exec wrangler whoami
corepack pnpm --filter @greenci/web build:worker --env dev
corepack pnpm exec wrangler d1 migrations apply greenci-dev --config apps/api/wrangler.jsonc --env dev --remote
corepack pnpm exec wrangler deploy --config apps/api/wrangler.jsonc --env dev
corepack pnpm exec wrangler deploy --config apps/web/wrangler.jsonc --env dev
node scripts/smoke-deployment.mjs dev
```

Both additive migrations (0002_domain.sql and 0003_routing.sql) applied successfully. API version: `ebfb1ea9-0c6e-4805-be83-a26545ae8de4`; web version: `99195b3c-c61f-4488-b879-5da1ffd62ff4`. Authenticated remote bindings returned 200/ok for API and web health, plus 200 for the landing with the approved headline and software-only plan present. The probe shut down afterwards. Anonymous requests to the actual public web/API URLs still returned 302 to the existing HeySalad Access login; the policy was not changed. Safe evidence: [live smoke](evidence/m45-live-smoke.json), [Access redirects](evidence/m45-access.json).

The local browser fidelity/approval/deckless tests are separate evidence from this authenticated deployed-service smoke. Browser automation could not reattach to the existing in-app tab in this pass; no claim of a new authenticated public-browser observation is made. The public URL remains the same. Remote actions are still disabled, with no GitHub App/model/container activation, no staging/production command and no PR merge.
