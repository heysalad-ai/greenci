# Invite-only dev beta

The beta is a reviewed source-repair profile behind Cloudflare Access, not public self-service. Public marketing can link to the public site; issue invitations privately after admission. Do not announce arbitrary-framework repairs or verified external onboarding until the external acceptance below is complete.

## Operator setup

1. Apply additive migration 0006 to the dev database. Keep the owner session flow and existing resources.
2. Configure the dev GitHub App with callback `https://beta.greenci.dev/api/client/invite/callback`. Set its post-install Setup URL to `https://beta.greenci.dev/beta`, replacing the original local bootstrap URL. It must permit installation by outside users for this journey; keep the existing repository permissions and have testers select individual repos. Changing App availability or Access admission requires explicit review; never make the API or app unauthenticated.
3. Put the App client ID and slug in the dev configuration. The operator stores `GITHUB_CLIENT_SECRET` directly as an encrypted dev Worker secret, never in source, chat, shell arguments or a local environment file. The App private key and OpenAI key already used by the owner remain internal Worker secrets.
4. Set `INVITE_BETA_ENABLED=true` only on dev. The default is false; endpoints also refuse staging/prod. A missing OAuth client secret fails closed with a setup error.
5. Restore the existing owner session on the audit page, then open `/beta`. Create an invitation for the tester's exact Access email and GitHub username. Share the random code privately; the database retains only its SHA-256 hash. Add precisely the same email to the existing Access allow policy for the beta hostname. Do not add Everyone, bypass rules or wildcard admissions. Do not send invitations without explicit messaging instructions.
6. The invited user opens `/beta`, completes Access, enters the code and consents to GitHub authorization. GitHub installation and any organisation approval must be performed by the external user/admin themselves.
7. They install the dev App on selected repositories, refresh, choose a writable repository and connect it. They can then open the repair dashboard, select an eligible pinned failing commit and request a source repair. Unsupported profiles are explicitly unavailable. Review the run and resulting draft PR; merging is manual and outside this beta workflow.

## Authentication and isolation

OAuth uses a ten-minute, single-use D1 state record bound to an HttpOnly SameSite=Lax browser cookie, the signed Access subject/email, invitation and PKCE verifier. The callback verifies Access again, exchanges the code server-side and checks `/user` against the invited GitHub login and bound numeric ID. It never trusts a callback installation ID. Redirects are fixed to the configured beta origin. Authorization codes, tokens and verifier values must not be logged.

A short-lived GitHub user token remains in server-side KV for at most one hour and is used only to discover authorised installations/repositories. No refresh token is retained; reauthorization is required after expiry. It is never returned to the browser or model. Logout removes that token and the session. Sessions are HttpOnly and mutations require the existing CSRF boundary. Every API request from an invited session rechecks invitation expiry/revocation and the feature flag.

Each invited GitHub identity has its own workspace. Connection admission revalidates App ID, active user-visible installation, writable selected repository and account owner. A repository already attached to another workspace cannot be claimed. Hosted phases derive a single-repository installation client from the saved connection and recheck the requesting actor's write permission; installation-token issuance verifies installation ownership and bounds token repositories/permissions. Neither caller nor model chooses credentials. Revocation prevents subsequent requests and background GitHub phases; already-started work cannot be retroactively undone.

Invited sessions cannot use owner device/operator, invitation-admin, repository-rule or streaming endpoints. Their dashboard uses authenticated polling, which revalidates on each request. Tenant checks apply to runs, diffs, decisions and saved audit snapshots. An empty snapshot does not block repair controls. Historical account-wide audits are not generated or shared automatically for new testers.

## Limits and repair boundary

At most five connected repositories per workspace, one active dashboard repair and two admitted repair starts per rolling 24 hours. The active slot and run are created atomically; a database trigger also enforces the daily cap. Reusing the same request ID recovers the same run. These are admission limits, not a monetary spending guarantee. Existing sandbox/model time/turn/diff limits remain in effect.

The hosted profile requires dependency-free `test.mjs`; only source fixes are supported in the existing isolated no-internet container. Dependencies, package installs and workflow edits require another reviewed profile. Existing path/risk approval and code-based verification/draft-only guards remain. Manual phase commands cannot race an automatic dashboard workflow. No merge or PR-approval endpoint is introduced.

## Acceptance and rollback

Offline tests must use fake providers and injected GitHub/Access fixtures. Verify forged/foreign/expired identities, email/login mismatch, wrong browser, state replay, CSRF, foreign App/installation/repo, read-only access, tenant isolation, revocation and admission caps. Exercise a real local Workflow through draft creation under an invited workspace. Browser tests cover sign-in errors, installation/connection, operator invite/revoke and mobile layout.

Separately, on hosted dev, verify Access redirects anonymously and the unchanged owner flow. An actual external user must consent to GitHub, connect a suitable failing repository, run OpenAI, inspect original-test verification and see an unmerged draft PR. A local fake journey or owner practice PR does not prove this external acceptance. Keep private identifiers/evidence outside the public tree.

Disable `INVITE_BETA_ENABLED` to close invited session/API/worker access while preserving owner functionality and records. Revoke individual invitations in `/beta`, and remove Access admissions as appropriate. Do not roll back additive schema with destructive migrations. No staging/production setup or deployment is part of this milestone.

GitHub flow references: [user authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [user-visible installations and repositories](https://docs.github.com/en/rest/apps/installations).
