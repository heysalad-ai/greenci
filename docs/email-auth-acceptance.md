# Dev email authentication acceptance

Before implementation:

- A new or returning user signs in by proving control of their email using a short-lived code. No passwords stored. Proof: API integration tests and live Windows signup/signout/signin.
- Codes are browser-bound, expire, are consumed atomically once and have bounded attempts; request rates are limited by email and edge address. Proof: wrong-browser, replay, wrong-code, expiry, concurrent redemption and rate tests.
- Email accounts have isolated workspaces and cannot reach operator/private data or repair a repo before explicit GitHub authorisation. No automatic linking by matching emails. Proof: tenant/route/link tests.
- GitHub sign-in still works, and an email user can explicitly link their GitHub identity without changing existing repository permissions. Proof: provider-mocked OAuth tests and existing browser journeys.
- Visible email/GitHub actions use the established brand, accessible labels, focus and narrow-screen layout. Proof: desktop/mobile captures and browser checks.
- Deploy dev only, preserve Access on operator/API and all repair draft boundaries. Proof: dev deployment IDs and anonymous Access redirects.
- Codes never appear in API responses, hosted logs, URLs or artifacts. Local delivery uses the existing local-only email outbox. Proof: response/log review and test-only delivery spy.

Status: implementation in progress. Live delivery and Windows evidence are required; local fixtures alone are insufficient.
