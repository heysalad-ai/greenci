# GreenCI

GreenCI helps a developer review failed CI, diagnose a cause, prepare a repair and inspect verification evidence before reviewing a pull request. It works in software; a physical command deck is optional. Existing product and visual authority live in AGENTS.md, the three docs/CODEX_PROMPT briefs, design-system/BRAND.md, the token/component files and approved design/screens.

The dev beta retains its authenticated owner flow and adds an invitation-bound external GitHub onboarding path. Hosted external acceptance remains gated on App/OAuth setup, exact Access admission and real external-user consent. The software surfaces are the web app, CLI and optional deck, with explicit Diagnose, Repair and Verify actions. There is no automatic merge. Default/protected branches, secrets and unapproved environments are guarded.

The repository-health extension lets an owner inspect a dated organisation audit, search/filter repositories, review findings and follow actual draft PRs. Local test evidence and hosted GitHub checks remain separate. Missing checks, account restrictions and coverage gaps are visible. This is a metadata/configuration baseline. Explicit owner starts can run the bounded hosted source-repair profile through diagnosis, verification and draft review; other repairs remain operator-assisted. It does not establish complete application security or arbitrary-repository repair execution.

The current release boundary is local and Cloudflare dev only. The public preview is distinct from the private Access-protected app. Private audit data stays out of source control and public assets. No new product identity, pricing or security certification is implied by this dashboard extension.

Public self-service signup is now an opt-in candidate on a separate dev origin. It uses GitHub identity, explicit selected-repository installation, the existing isolated repair profile and draft-only review. The protected operator host and private invitation path remain distinct. Public signup is disabled in current deployments until the separate release steps complete; local fixtures do not establish independent external-user acceptance.

Public dev signup is enabled at app.greenci.dev/beta. A hosted public-customer path using the operator's GitHub account connected the selected starter repository and produced a real OpenAI draft repair with both GitHub test checks passing. The repair remains unmerged and operator/API Access remains enabled. Independent external-user acceptance is still unverified; see docs/launch-readiness.md.
