# GreenCI launch candidate

GreenCI currently runs as an Access-protected dev beta. The marketing site is public. This document separates observed activation from the remaining external acceptance and any later public deployment.

## Observed activation

- The dev GitHub App callback is `https://beta.greenci.dev/api/client/invite/callback`; homepage and post-install Setup URL are `https://beta.greenci.dev/beta`. The original localhost bootstrap URL has been replaced.
- The operator approved making the GitHub App installable by outside accounts. GitHub confirmed public App availability. Existing repository permissions and webhook/SSL settings were retained. App availability is separate from application/API access: the beta is still behind Access.
- Anonymous beta/API requests redirect to Access; the separate public marketing site responds successfully. Authenticated service-binding checks of dev API health, web health and the landing page pass.
- The deployment smoke script pins the configured Cloudflare account instead of relying on an interactive account choice. It runs a loopback-only proxy, removes it on exit and creates no public Worker or authentication bypass.
- The invitation/workspace implementation is in the preceding draft PR stack; its full local/CI checks passed. Reviewed implementation fixes have been merged into the beta feature branch; main is unchanged.

## External-user acceptance remaining

1. Encrypted OAuth secret storage, hosted owner GitHub sign-in and writable repository discovery are verified. Keep values out of source, logs, chat and local environment files; public release credential checks use metadata only.
2. For the existing private beta, admit an exact Access email and matching GitHub invitation. The public self-service candidate instead uses a separately pinned origin and GitHub admission without invitation codes; see public-beta.md. An independent person must provide their own consent/authentication for external acceptance; an owner or fixture does not prove it.
3. On a selected supported repository, verify GitHub authorization, installation discovery, repository write permission and connection to the tester's isolated workspace. Confirm another workspace's data remains inaccessible.
4. Start one real OpenAI repair on a pinned failing commit, observe execution continue after navigation, inspect original-test verification and confirm an App-authored unmerged draft PR with only allowed changes. Record actual GitHub check outcomes separately from local/container verification.
5. Revoke the invitation and verify subsequent reads/actions and GitHub phases are denied. Keep the resulting draft for human review and retain private acceptance evidence outside the public source tree.

## Before a public deployment

Prepare a separate production configuration and credentials only when explicitly authorised. Confirm customer authentication, connection/revocation, workspace isolation, source-profile limits, repair capacity, operational alerts and rollback against that exact candidate. Publish accurate data-use/retention and support information. Keep internal administration protected and preserve human merging. Changing production access or deploying production is a separate reviewed action; this dev milestone does neither.

Marketing and submission drafts should describe the observed source-only beta. They must not imply arbitrary-framework repairs, independent external acceptance, continuous security monitoring or production readiness before those are evidenced. No social post, Product Hunt launch, Cookbook submission or external invitation is sent as part of this activation work.

## Public self-service candidate

The user requested signup for anyone. Public admission is therefore being prepared on app.greenci.dev, separately from the Access-protected operator beta. The candidate includes bounded GitHub signup, an isolated frontend configuration, existing selected-repository/draft-only guards and a public practice template. It is not publicly enabled yet. The onboarding/docs UI received a scoped finish-review disposition of ship; that is a UI verdict, not deployment or independent external acceptance. See public-beta.md for the rollout order and rollback boundaries.
