# Action icon consistency

Acceptance criteria before verification:

- GitHub sign-in, connection, access-management, template and draft-PR actions share the official GitHub mark with visible labels. Proof: rendered desktop/mobile beta views and source review of neighboring actions.
- Both beta dashboard entries use the existing secondary button and Repair wrench. Proof: rendered signed-out and signed-in states; links still target /app/audit.
- Labels remain accessible, keyboard focus visible and 390px layout free of horizontal overflow. Proof: existing public/invite browser journeys and screenshots.
- No authentication, Access, provider, repository-permission or repair behavior changes. Proof: scoped diff plus existing type, lint, unit and browser checks.

Status: local verification passed: lint, typecheck, 129 tests and all 17 browser journeys. The browser run built the Next/OpenNext Worker bundle. Desktop (1440px), mobile (390px) and 415px keyboard-focus captures were inspected, including the signed-in connection view. No horizontal overflow. Existing unrelated audit CSS autoprefixer warning (`end` versus `flex-end`) remains. Hosted verification pending. Screenshot fixtures are local synthetic data, not external-account acceptance.

Local evidence: `.data/public-beta/review/{desktop,mobile,user-415}.png`, `.data/invite-beta/review/{connected,connected-mobile}.png`. These generated files remain private/ignored.
