# Read-only GitHub baseline audit

Run `pnpm audit:github` with Node 22 and an existing authenticated GitHub CLI. The current command covers owned repositories in `chilu18` and `heysalad-ai`, including private, forked and archived repositories. It uses the existing CLI connection for reads; it does not widen the private beta App installation. It does not require an OpenAI key, execute repository code, change repository settings or create repairs.

Reports are written to ignored `.data/github-audit/latest/` with private directory/file modes. An optional first argument selects another private local output directory. Do not commit reports: they include private repository names and security posture.

The collector exhausts REST inventory pagination, pins default branch commits through GraphQL, reads check rollups and open dependency alert counts, records classic branch protections and security-feature metadata, and lists the pinned Git tree. Only bounded `.github/workflows/*.yml` and `*.yaml` files are read. Workflow bodies are discarded after deterministic heuristic checks. No secrets endpoints, logs, `.env` files or arbitrary source-file reads are supported by the live transport allowlist. Customer repository content is never executed or sent to a model.

The JSON report preserves per-repository evidence, timestamps, coverage gaps, fork/archive classification and finding locations. The Markdown report is a baseline configuration review. A missing check is not a successful build; an API denial is not zero alerts. A missing classic protection rule does not account for rulesets, and inherited policies/bot configurations may exist. Source-code vulnerabilities, exploitability, actual build execution, runtime/deployment security, historical secret exposure and actual carbon emissions remain unverified. A finding's priority is a triage aid, not a CVSS severity. Review forks and archived projects separately.

Validation uses fake transport fixtures only: `pnpm exec vitest run tests/github-audit.test.ts`. Run the live audit separately from automated tests. Never treat this command as certification that a repository is secure or green.
