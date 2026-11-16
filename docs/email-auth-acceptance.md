# Dev email authentication acceptance

Before implementation:

- A new or returning user signs in by proving control of their email using a short-lived code. No passwords stored. Proof: API integration tests and live Windows signup/signout/signin.
- Codes are browser-bound, expire, are consumed atomically once and have bounded attempts; request rates are limited by email and edge address. Proof: wrong-browser, replay, wrong-code, expiry, concurrent redemption and rate tests.
- Email accounts have isolated workspaces and cannot reach operator/private data or repair a repo before explicit GitHub authorisation. No automatic linking by matching emails. Proof: tenant/route/link tests.
- GitHub sign-in still works, and an email user can explicitly link their GitHub identity without changing existing repository permissions. Proof: provider-mocked OAuth tests and existing browser journeys.
- Visible email/GitHub actions use the established brand, accessible labels, focus and narrow-screen layout. Proof: desktop/mobile captures and browser checks.
- Deploy dev only, preserve Access on operator/API and all repair draft boundaries. Proof: dev deployment IDs and anonymous Access redirects.
- Codes never appear in API responses, hosted logs, URLs or artifacts. Local delivery uses the existing local-only email outbox. Proof: response/log review and test-only delivery spy.

Local verification: PASS — lint/typecheck, 139 tests, 19 browser journeys and 100% core coverage. Browser tests exercise registration, sign-out, returning login, wrong codes, send errors, separate GitHub consent and narrow-screen rendering. Security API tests cover browser binding, expiry, replay/concurrent use, attempt limits, revoked accounts, CSRF and changed-session linking. Existing GitHub journeys pass.

Hosted dev: migration 0008 applied to greenci-dev; API bb36d201-e725-4bdb-b387-f55417c47ee2; public frontend fac889a4-cad0-41a3-835a-aa3f851f3630; protected frontend 1699880e-dcb9-4e06-ab05-8f078aa61b76. Public web/API health returns ok; public mode reports emailSignup true. Anonymous protected frontend and API still return 302 Access redirects. Cloudflare marks email.dev.greenci.dev sending Enabled and DNS Configured. No staging/production, provider-secret or repository-permission changes.

Windows Edge InPrivate: live signup form rendered. Requested a real code for the existing controlled test alias and observed the successful code-entry screen. User inbox verification is pending, so live account creation, sign-out and returning login are NOT yet verified. Recording and phone mirroring are stopped. No codes are saved in artifacts. Local fixtures alone are not Windows acceptance.
