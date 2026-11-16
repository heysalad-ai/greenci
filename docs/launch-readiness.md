# GreenCI dev public beta

The user-authorised dev public customer entry is `https://app.greenci.dev/beta`. The operator entry `https://beta.greenci.dev` and direct API remain behind Cloudflare Access. No staging or production deployment has been made; main remains unchanged and implementation is reviewable in the feature PR stack.

## Observed hosted customer path

- GitHub App settings retain the private callback and add `https://app.greenci.dev/api/client/invite/callback`, with wildcard matching off. Homepage is `https://greenci.dev/`; post-install Setup URL is the public beta entry. Existing permission types, webhook and SSL settings remain.
- The exposed unused OAuth client secret has been removed. GitHub reports two remaining credentials, including the active replacement; Cloudflare stores the client secret as an encrypted Secret. No credential values were retrieved for these checks.
- The App installation is restricted to `greenci-practice` and the explicitly approved `greenci-starter`; all-repository access remains off.
- Public GitHub sign-in completed without an invitation code or Access login. The resulting identity is recorded as public admission. Discovery and connection succeeded on the approved starter repository in a separate customer workspace.
- A real OpenAI repair completed Diagnose, Repair, Verify and draft creation on dev. [Starter draft PR #1](https://github.com/heysalad-ai/greenci-starter/pull/1) is App-authored and changes one line in `src/add.mjs`. Original tests and workflows are unchanged. Both GitHub test checks pass; CodeRabbit is skipped for the App. The repair PR is draft, open and unmerged.
- A request from the public session for a known operator-workspace run returned `404 Not Found`. Anonymous operator/API requests still redirect to Access.
- This customer-path test used the operator's own GitHub account after an explicit reset of its empty prior invitation-test binding. No customer data, operator workspace or previous repair PR was moved. It is not an independent-person acceptance test.

## Source and environment evidence

The complete candidate passed lint, typechecks, 129 unit/integration tests, 100% core coverage, all 20 builds, an OpenNext Worker build and 17 browser journeys before this hosted run. Reviewed implementation PRs #8–#13 are merged into the beta feature branch. The public frontend is `greenci-web-public-dev` and the API is `greenci-api-dev`; encrypted provider secrets are preserved. Dev migration 0007 is applied.

UI fixture finish reviews cover only their captured scope. Browser Tab Suspender interrupted the final hosted UI walk-through after the real repair had completed; this does not negate the observed OAuth, connection, workflow or GitHub results. No unobserved final sign-out/re-entry or hosted revocation check is claimed.

## Independent external acceptance still required

An independent user must authenticate and consent on their own account, install on a selected supported repository, connect its isolated workspace and request a real OpenAI repair. Inspect original-test verification, GitHub checks and an App-authored unmerged draft PR. Verify cross-workspace denial and revocation, including subsequent GitHub phases. Keep private identity/evidence records outside source control. Neither the owner-run result nor fixtures satisfy this requirement.

The user requested public dev signup without selecting a named tester. The public dev entry is therefore available for users to try; independent acceptance remains an open evidence item rather than a claim of completion or production readiness. This does not authorise production, broader repository grants, automatic merges, social posts, Product Hunt publication or a Cookbook submission.

## Limits and rollback

Only dependency-free Node `test.mjs` source repairs are supported. Five repositories, one active repair and two repair starts per workspace per rolling day; twenty admitted public repair starts across all workspaces per rolling day. Admission caps are not a monetary spending guarantee. Source/check logs go to OpenAI; run artifacts remain in Cloudflare and automatic deletion is not enabled. See [public-beta.md](public-beta.md) for data use, support, deployment and rollback.

Disable `PUBLIC_BETA_ENABLED` with the private dev configuration before any rollback that would remove admission checks. Keep the additive migration and evidence; preserve Access on the operator/API hosts.
