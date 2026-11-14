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
