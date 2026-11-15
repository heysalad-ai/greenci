# Private beta: one real repair

Status: the first real OpenAI repair is verified in dev. The signed owner session imported real GitHub CI, diagnosed and repaired the source defect, verified passing checks on the repair SHA and opened [draft PR #1](https://github.com/heysalad-ai/greenci-practice/pull/1) through the installed GitHub App. The PR remains unmerged. Private web/API retain Access; the separate public preview is unchanged.

## First repository

The user selected a new private `heysalad-ai/greenci-practice` repository. Initial commit `59fcd7b636665f04e4463daf5a8ea92ec4974dca` contains a zero-dependency arithmetic defect in `src/add.mjs`. The immutable test expects addition, while the implementation subtracts. Real [Practice CI run 43536697667](https://github.com/heysalad-ai/greenci-practice/actions/runs/43536697667) fails as intended.

The repository was initialized on `greenci/practice-baseline`, which became its default branch. No existing default branch was pushed. The real adapter obtains each repository's default branch from GitHub rather than assuming main, and rejects writes to it even when its name starts with greenci/. Only `src/**` is writable in the first beta profile. Tests, workflow files, metadata and secrets cannot be changed by that profile.

## Implementation

- GitHub App JWT signing works with GitHub's PKCS1 PEM format and has a synthetic-key test in the actual Workers runtime. Short-lived installation tokens are narrowed to the configured repository names; installation owner and suspension are checked. Reads use normal Git blobs from bounded, nontruncated snapshots, excluding symlinks and secret paths.
- Repair writes create a tree from the existing base tree, preserve executable mode, create a commit with an explicit parent and update only a repair ref without force. Protected/oversized changes require approval. Draft PRs require fresh passing checks on the exact repair SHA, baseline check coverage, a visible real diff and the expected PR head/base. Later PR head changes hand the run back and clear verification.
- Private sessions verify the Cloudflare Access JWT signature, issuer, application audience, expiry and exact configured owner email; no email header is trusted. Repository write permission is checked before session registration and repair actions. Session credentials remain in Secure/HttpOnly/SameSite cookies. The beta is restricted to one configured owner and one installation owner, with an explicit repository allowlist.
- The onboarding setup action performs an explicit live model probe without repository data and a sandbox execution/denied-network probe. Repair actions and comment commands remain blocked until those probes pass. Automatic diagnosis/repair is disabled in this initial beta. The approval button is enabled only after the displayed diff revision matches the run revision.
- Public webhook ingress forwards only the fixed webhook path and GitHub signature/delivery headers to the private API, which validates HMAC before queuing. Browser cookies, credentials and arbitrary API paths are never forwarded.
- Email is explicitly disabled for this dev beta; it does not require activating Resend. Mobile and remote CLI sign-in remain later work.

## Credential setup

The user chose to reuse an existing OpenAI key. The dev API has no local key file, and no key values are read through agent tools. The user saved `OPENAI_API_KEY` directly as an encrypted secret on `greenci-api-dev` in HeySalad Inc. Secret-name-only verification confirms it is present; no key value was read.

The GitHub App setup uses GitHub's official manifest flow:

```sh
pnpm beta:setup
```

Open `http://localhost:8977`. Create the private App under heysalad-ai and select **only greenci-practice** for installation. The local callback validates its state and cookie, exchanges the one-time code and sends the generated App private key/webhook secret directly into the dev API Worker secret store. It also pairs a generated sandbox credential between the API and beta sandbox. Values stay in process memory and are not printed or saved locally. Only public App/installation metadata is saved under ignored `.data/beta/setup.json`.

GitHub App `greenci-dev-heysalad-3e9efc` (ID 5753358) is created under heysalad-ai and installed only on greenci-practice (installation 181786346). The user explicitly delegated the browser flow; the callback confirmed completion and credential pairing. It binds loopback only, checks the Host header and expires after one hour. Restart it if no App was created and the setup window expires; do not blindly create duplicate Apps after a partial setup.

After setup, prepare a dev-only profile using the exact email from the owner's private Access identity:

```sh
pnpm beta:prepare <access-email>
```

The generated profile is ignored and contains only configuration metadata, not secret values. Its Access audience is derived from the existing login redirect and has passed a real signed owner session. It selects the ordinary `gpt-6-sol` repair model, Responses-based Decisions and the contained Cloudflare runtime. Check secret names, build/test and dry-run the generated profile before deploying it. Do not alter staging or production.

## New dev-only support Workers

Published in HeySalad Inc. (`67a17ada4efeee4480283035cc0c5f90`):

| Worker                   | Version                              | Current observation                                                                                   |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| greenci-sandbox-beta-dev | 2b72aa6f-1939-4b1c-9477-4e3dd71c60e7 | Credential paired: unauthenticated health returns 401; Node execution and denied-network probe passed |
| greenci-webhooks-dev     | 312de0d3-8c24-449e-a65e-cae31f921bb1 | Unauthenticated GET returns 404; private API activated; live signed delivery not yet verified         |

Sandbox application ID: `a0363cd7-37a1-4d00-8a7a-8d3c83b60311`. It uses the matching official `docker.io/cloudflare/sandbox:0.12.14` image directly, so local Docker is unnecessary. The Sandbox subclass disables Internet access, the warm pool target is zero, capacity is one, and the bridge rejects requests without its mandatory bearer credential. Live acceptance ran a Node script with exit code 0 and a direct external TCP-denial probe with exit code 0. The sandbox uses the basic instance size (1 GiB), one-instance cap and zero warm target. GreenCIPool coalesces concurrent startup requests; its workerd regression reproduced three starts before the guard and one after it. A second regression covers recovery from a zero ceiling after transient platform exhaustion.

Commands already executed:

```sh
pnpm exec wrangler deploy --config apps/sandbox/wrangler.beta.jsonc --env dev --dry-run
pnpm exec wrangler deploy --config apps/webhooks/wrangler.jsonc --env dev --dry-run
pnpm exec wrangler deploy --config apps/sandbox/wrangler.beta.jsonc --env dev
pnpm exec wrangler deploy --config apps/webhooks/wrangler.jsonc --env dev
```

Anonymous private web/API requests return 302 to Access, while the public preview returns 200 and the sandbox rejects unauthenticated requests with 401. Private API/web were activated only in dev. Migration `0004_operator_retries.sql` was applied only to dev D1: explicit operator retries get independent run IDs while automatic webhook deduplication remains deterministic. No Access policy was weakened, staging/production deployed, PR merged or PR approved.

## Cyber API

The [official Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak) documents `gpt-6-cyber` through Responses with `access_programs.cyber=daybreak_red`. It requires organization/project approval, additional model approval and an approved IP allowlist; Workers' ordinary shared egress is not a confirmed fixed-egress solution. Cyber inference remains disabled until those requirements are confirmed. The setup probe checks model visibility separately and does not treat visibility as inference approval. The existing key returned HTTP 404 for Cyber model visibility; no Cyber inference has been attempted.

## Live acceptance: 14 November 2026

- Signed owner session: HTTP 200; GitHub App lists only the practice repository and confirms owner write access. JWT signature, issuer, audience, expiry and configured owner are validated; Workers default fetch uses manual redirects during validation.
- GitHub's read-only commit-status permission is granted and accepted on installation 181786346, still restricted to `greenci-practice`. Failed checks import without ignoring permission errors.
- OpenAI: real diagnosis and repair used `gpt-6-sol`; Decisions used Responses with `gpt-6-luna`. Cyber visibility returned HTTP 404; no Cyber inference was attempted.
- Sandbox: Node script returned exit 0 and its expected marker. A bounded direct TCP probe to 1.1.1.1:443 returned the denial marker and exit 0; its session was deleted. Probes passed again after removing the temporary cleanup handler. This is observed probe evidence, not an audit of every possible egress path.
- An exact stopped probe instance from earlier startup races was reclaimed using a temporary bearer-protected dev handler. That handler and caller were removed and redeployed. Old pool namespaces retain their alarms; new sessions use GreenCIPool. No repository data entered those probe containers.

### Real repair evidence

| Evidence             | Observed result                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application run      | [`run-b0359999-a4ce-4e38-9937-3f71a044d550`](https://greenci-web-dev.heysalad-o.workers.dev/app/runs/run-b0359999-a4ce-4e38-9937-3f71a044d550), state `pr_open`, 1/1 checks passing |
| Workflow trace       | `trace_e822fd611b084529ad8b982d6bf43f9b`                                                                                                                                            |
| Original/default SHA | `59fcd7b636665f04e4463daf5a8ea92ec4974dca`, unchanged after repair                                                                                                                  |
| Repair SHA           | `c3ac958f7a4509e3ed6ab017e85d33df44e3553e`                                                                                                                                          |
| Patch                | Only `src/add.mjs`: `left - right` becomes `left + right`; one commit, +1/-1; tests and workflows unchanged                                                                         |
| Exact-head push CI   | [43597445852](https://github.com/heysalad-ai/greenci-practice/actions/runs/43597445852), `test` passed                                                                              |
| Pull-request CI      | [43597524685](https://github.com/heysalad-ai/greenci-practice/actions/runs/43597524685), `test` passed                                                                              |
| App-created PR       | [Draft #1](https://github.com/heysalad-ai/greenci-practice/pull/1), authored by `greenci-dev-heysalad-3e9efc[bot]`, open and unmerged                                               |

The first attempt `run-ba052d1673e5c412ad1fb40d6d7df6ff` failed closed before a GitHub write and remains recorded as handed back. Its cause was filtering out the Agents SDK native `apply_patch` tool. The corrected adapter retains that tool and validates workspace paths and move destinations at the editor boundary before writes. Unsupported function calls receive bounded policy feedback without execution. A new explicit operator retry produced the successful run above; no failed-run history was reset. Protected-path, approval and final GitHub diff/check guards remain enforced.

### Deployed dev versions

| Worker          | Version                                                   |
| --------------- | --------------------------------------------------------- |
| Private API     | `d0405e82-4a11-4cf9-9af4-f4e4c7c4a7e8` (source `2851b67`) |
| Private web     | `d42d9935-b809-4861-9365-6586ed7c3d7b`                    |
| Beta sandbox    | `2b72aa6f-1939-4b1c-9477-4e3dd71c60e7`                    |
| Webhook ingress | `312de0d3-8c24-449e-a65e-cae31f921bb1`                    |

Offline gate: lint and all 18 typechecks pass; 74 tests across 14 files pass; core coverage is 100% statements/branches/functions/lines; all 18 builds and seven browser journeys pass. Automated tests use synthetic credentials, fake models and mocked GitHub. The real provider journey above is a separate live acceptance action.

This acceptance covers one owner, one selected repository and one source-only repair. Broader repository onboarding, automatic repair, mobile/remote CLI sign-in and Cyber inference remain outside this dev beta acceptance. Review and merge remain human actions.
