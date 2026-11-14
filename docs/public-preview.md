# Public site preview

The user selected a public site preview first, rather than live GitHub repairs. Use the HeySalad Inc. account (`67a17ada4efeee4480283035cc0c5f90`). This is a separate dev-only Worker, `greenci-preview-dev`; existing web/API Access policies and private development services stay in place.

The public Worker serves the approved landing composition and read-only captures from Claude's M5 branch (`356f268deb30b11c6e8ae1d7f030e325d61971c0`). Every page identifies the preview. Prices, shipping dates, customer quote placeholders and order CTAs are omitted. The product gallery explicitly describes images as noninteractive local practice examples.

There is only one binding: static ASSETS. No API service binding, database, sessions, model key, GitHub credential, sandbox, queue or workflow is attached. GET/HEAD pages and assets are allowlisted; writes return 405, API routes return 404, and app/onboarding links redirect to the read-only gallery. CSP blocks scripts, connections, frames and form submissions. Preview URLs are disabled and search indexing is disallowed.

Build and local verification:

```sh
pnpm build:preview
pnpm exec wrangler deploy --config apps/web/wrangler.preview.jsonc --env dev --dry-run
pnpm exec wrangler dev --config apps/web/wrangler.preview.jsonc --ip 127.0.0.1 --port 3002 --inspector-port 9236
node scripts/smoke-public-preview.mjs http://localhost:3002
pnpm lint
pnpm typecheck
pnpm test:core
pnpm test
pnpm build
pnpm e2e
```

Publish only the dedicated preview:

```sh
pnpm exec wrangler deploy --config apps/web/wrangler.preview.jsonc --env dev
node scripts/smoke-public-preview.mjs https://greenci-preview-dev.heysalad-o.workers.dev
```

Do not run the ordinary multi-service deployment workflow to publish this preview. There are no staging or production profiles in the preview configuration. Deployment version and live evidence are recorded below after verification.

## Deployment verified — 14 November 2026

Published [public landing](https://greenci-preview-dev.heysalad-o.workers.dev/) and [product captures](https://greenci-preview-dev.heysalad-o.workers.dev/preview) from `d2106d4b3b52201a0dd5208a593b3de0f0e23a29`. Cloudflare Worker version: `35474f3d-496d-485b-a476-d990ee546955`. Wrangler whoami confirmed HeySalad Inc. before deployment; an expired OAuth session was renewed interactively with `pnpm exec wrangler login`. No credential values were read, saved to this repository or printed by this task.

Fresh verification passed: lint and types, 52 tests, 100% core coverage, all 18 package builds and seven browser journeys. The complete app build/browser preparation was rerun sequentially after an overlapping build attempt was stopped; the recorded passing results come from that clean sequential run. Static build assertions reject unresolved marketing placeholders and external dependencies. Wrangler dry-run and the actual upload showed only ASSETS.

[Public HTTP smoke](evidence/public-preview-smoke.json) confirms anonymous 200 responses for the landing, gallery, docs, CSS, screenshot, font and health; writes return 405, API paths return 404, and onboarding/app routes redirect to the gallery. [Private boundary evidence](evidence/public-preview-private-boundary.json) confirms the existing web/API still return Access redirects. Both live pages were inspected in the browser; the landing was checked at desktop and 390px mobile widths. Captures: [desktop](evidence/public-preview-desktop.png), [mobile](evidence/public-preview-mobile.png).

Only the new dev-only preview Worker was deployed. No existing Worker, Access policy, database, credential, staging or production environment was changed. PR #3 is a draft stacked on Claude's M5 PR #2; no PR was merged or approved.
