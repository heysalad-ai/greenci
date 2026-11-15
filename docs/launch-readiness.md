# GreenCI launch candidate

GreenCI currently runs as an Access-protected dev beta. The marketing site is public. This document separates observed activation from the remaining external acceptance and any later public deployment.

## Observed activation

- The dev GitHub App callback is `https://beta.greenci.dev/api/client/invite/callback`; homepage and post-install Setup URL are `https://beta.greenci.dev/beta`. The original localhost bootstrap URL has been replaced.
- The operator approved making the GitHub App installable by outside accounts. GitHub confirmed public App availability. Existing repository permissions and webhook/SSL settings were retained. App availability is separate from application/API access: the beta is still behind Access.
- Anonymous beta/API requests redirect to Access; the separate public marketing site responds successfully. Authenticated service-binding checks of dev API health, web health and the landing page pass.
- The deployment smoke script pins the configured Cloudflare account instead of relying on an interactive account choice. It runs a loopback-only proxy, removes it on exit and creates no public Worker or authentication bypass.
- The invitation/workspace implementation is in the preceding draft PR stack; its full local/CI checks passed. No PR has been merged.

## External-user acceptance remaining

1. Store the GitHub OAuth client secret directly as an encrypted secret on `greenci-api-dev`. Do not expose it in source, logs, chat or local environment files. Verify configuration by secret name only, then validate it through the actual browser OAuth flow.
2. Admit a named tester's exact email through the existing beta Access policy, with a matching private seven-day GitHub invitation. An external person must provide their own consent/authentication; an owner or synthetic fixture does not establish this acceptance.
3. On a selected supported repository, verify GitHub authorization, installation discovery, repository write permission and connection to the tester's isolated workspace. Confirm another workspace's data remains inaccessible.
4. Start one real OpenAI repair on a pinned failing commit, observe execution continue after navigation, inspect original-test verification and confirm an App-authored unmerged draft PR with only allowed changes. Record actual GitHub check outcomes separately from local/container verification.
5. Revoke the invitation and verify subsequent reads/actions and GitHub phases are denied. Keep the resulting draft for human review and retain private acceptance evidence outside the public source tree.

## Before a public deployment

Prepare a separate production configuration and credentials only when explicitly authorised. Confirm customer authentication, connection/revocation, workspace isolation, source-profile limits, repair capacity, operational alerts and rollback against that exact candidate. Publish accurate data-use/retention and support information. Keep internal administration protected and preserve human merging. Changing production access or deploying production is a separate reviewed action; this dev milestone does neither.

Marketing and submission drafts should describe the observed source-only beta. They must not imply arbitrary-framework repairs, independent external acceptance, continuous security monitoring or production readiness before those are evidenced. No social post, Product Hunt launch, Cookbook submission or external invitation is sent as part of this activation work.
