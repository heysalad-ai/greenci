# GreenCI

GreenCI helps a developer review failed CI, diagnose a cause, prepare a repair and inspect verification evidence before reviewing a pull request. It works in software; a physical command deck is optional. Existing product and visual authority live in AGENTS.md, the three docs/CODEX_PROMPT briefs, design-system/BRAND.md, the token/component files and approved design/screens.

The primary operator for the current dev beta is the authenticated owner. The software surfaces are the web app, CLI and optional deck, with explicit Diagnose, Repair and Verify actions. There is no automatic merge. Default/protected branches, secrets and unapproved environments are guarded.

The repository-health extension lets an owner inspect a dated organisation audit, search/filter repositories, review findings and follow actual draft PRs. Local test evidence and hosted GitHub checks remain separate. Missing checks, account restrictions and coverage gaps are visible. This is a metadata/configuration baseline. Explicit owner starts can run the bounded hosted source-repair profile through diagnosis, verification and draft review; other repairs remain operator-assisted. It does not establish complete application security or arbitrary-repository repair execution.

The current release boundary is local and Cloudflare dev only. The public preview is distinct from the private Access-protected app. Private audit data stays out of source control and public assets. No new product identity, pricing or security certification is implied by this dashboard extension.
