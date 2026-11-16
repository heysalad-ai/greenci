# Public self-service beta release

## Candidate boundary

- Public customer entry: `https://app.greenci.dev/beta`, Worker `greenci-web-public-dev`. GitHub signs users in; no invitation code or Cloudflare account is required.
- Existing operator entry: `https://beta.greenci.dev`, Worker `greenci-web-dev`, remains behind Access. The API Worker remains Access-protected and is reached through service bindings.
- This is dev only. No production/staging configuration is created or deployed. Public availability does not change the App's repository permissions or enable automatic merges.
- New public signup does not silently convert an existing Access-bound private identity. Existing private testers keep their protected sign-in path.

## Limits and data use

Five repositories and two admitted repair starts per workspace per rolling day; one active repair per workspace. The database also caps all public accounts at twenty repair starts per rolling day. Signup has a per-client ten-start/five-minute bucket limit and at most one hundred unexpired public OAuth states. The address header is overwritten at the web edge; rate metadata stores a bucketed digest, not the raw address, and expired counters are reclaimed on a later signup attempt. These admission limits are not a monetary spending guarantee.

Only dependency-free Node `test.mjs` source repairs are supported. No dependency installation or workflow repairs. Requested repairs send source and check logs to OpenAI. Run records, logs and diffs are retained for review; automatic artifact deletion is not enabled. User-facing data-use copy and support/revocation links are on `/docs#public-beta`.

The public [practice template](https://github.com/heysalad-ai/greenci-starter) contains an intentional source bug, original tests and pinned Actions. Its failing default-commit CI is expected. A local one-line source fix passes both original tests. Template publication does not prove a customer repair.

## Rollout order

1. Review exact source heads and required CI. Keep the public flags closed until the candidate is reviewed. Run lint, type checks, 100% core coverage, full tests, builds and browser journeys with fake providers. Dry-run both target Worker configurations.
2. Apply additive migration `0007_public_beta.sql` to `greenci-dev` before deploying the new API code. Check pending migrations first with the existing beta configuration. Do not drop or rewrite existing tenant records.
3. In the existing GitHub App, retain the private callback and append `https://app.greenci.dev/api/client/invite/callback`. Set the public homepage to `https://greenci.dev/` and post-install Setup URL to `https://app.greenci.dev/beta`. Preserve SSL, webhook settings and existing repository permissions. Authentication/passkey prompts and credential entry remain human steps when required.
4. Confirm that the OAuth client secret is encrypted and that the intended active credential is current. Inspect names/types/usage metadata only. Never retrieve or print credential values. Reuse existing internal GitHub App, sandbox and OpenAI secrets.
5. Run `pnpm exec tsx scripts/public-beta-prepare.mts`. It checks current private Access redirects and creates ignored, dev-only API metadata at `apps/api/wrangler.public-beta.generated.jsonc`; it neither deploys nor changes Access.
6. Build the OpenNext Worker, then deploy only the explicit dev API candidate and separate public web Worker. The latter has only the custom domain `app.greenci.dev`, with workers.dev and preview URLs disabled. The existing operator Worker and its Access policy are not replaced.

```sh
pnpm --filter @greenci/web build:worker
pnpm exec wrangler deploy --config apps/api/wrangler.public-beta.generated.jsonc --env dev
pnpm exec wrangler deploy --config apps/web/wrangler.public-beta.jsonc --env dev
```

## Hosted acceptance

Verify anonymous public signup and documentation render, while operator/API requests still redirect to Access. Exercise a fresh GitHub callback and repository discovery. A genuinely independent account must install on a selected supported repository, connect to its isolated workspace, request one real OpenAI repair and inspect original-test verification plus the App-authored draft PR. Verify cross-workspace denial and revocation, including subsequent background phases. Leave the PR unmerged. Keep private identity/evidence records outside source control. An owner, fixture, template or successful callback alone does not satisfy this acceptance.

## Stop and rollback

Disable `PUBLIC_BETA_ENABLED` using the existing private beta dev configuration first. Current public sessions and future background phases are then denied while the owner path remains available. Remove the public hostname route or serve a maintenance response if needed. Keep the migration and evidence records; do not destructively roll back schema.

Do not roll the API back to code predating admission-mode checks while a public frontend remains active: that older code does not understand the public kill switch. Close the public entry point and revoke public admissions before any such code rollback. Never disable Access on the operator/API hosts. Changes to production, broader App permissions, automated merging and social publication are separate actions.
