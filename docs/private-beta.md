# Private beta: one real repair

Status: offline validation and live provider acceptance are recorded below. Private dev API/web code is deployed behind the existing Access protection; The signed owner session, real GitHub repository metadata, live OpenAI response, Node execution and denied-network probe pass. CI import is awaiting the read-only commit-status permission. The public site preview is separate and unchanged. Live OpenAI readiness inference has completed; no repository repair or repair PR has been produced yet.

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
| greenci-sandbox-beta-dev | 676fd38d-efa4-4216-b4e3-c09f3e137e7d | Credential paired: unauthenticated health returns 401; Node execution and denied-network probe passed |
| greenci-webhooks-dev     | 312de0d3-8c24-449e-a65e-cae31f921bb1 | Unauthenticated GET returns 404; private API activated; live signed delivery not yet verified         |

Sandbox application ID: `a0363cd7-37a1-4d00-8a7a-8d3c83b60311`. It uses the matching official `docker.io/cloudflare/sandbox:0.12.14` image directly, so local Docker is unnecessary. The Sandbox subclass disables Internet access, the warm pool target is zero, capacity is one, and the bridge rejects requests without its mandatory bearer credential. Live acceptance ran a Node script with exit code 0 and a direct external TCP-denial probe with exit code 0. The sandbox uses the basic instance size (1 GiB), one-instance cap and zero warm target. GreenCIPool coalesces concurrent startup requests; its workerd regression reproduced three starts before the guard and one after it. A second regression covers recovery from a zero ceiling after transient platform exhaustion.

Commands already executed:

```sh
pnpm exec wrangler deploy --config apps/sandbox/wrangler.beta.jsonc --env dev --dry-run
pnpm exec wrangler deploy --config apps/webhooks/wrangler.jsonc --env dev --dry-run
pnpm exec wrangler deploy --config apps/sandbox/wrangler.beta.jsonc --env dev
pnpm exec wrangler deploy --config apps/webhooks/wrangler.jsonc --env dev
```

After these deployments, anonymous private web/API requests still returned 302 to Access, while the public preview returned 200. No existing private web/API runtime was activated, Access policy changed, database migrated, staging/production deployed, PR merged or PR approved.

## Cyber API

The [official Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak) documents `gpt-6-cyber` through Responses with `access_programs.cyber=daybreak_red`. It requires organization/project approval, additional model approval and an approved IP allowlist; Workers' ordinary shared egress is not a confirmed fixed-egress solution. Cyber inference remains disabled until those requirements are confirmed. The setup probe checks model visibility separately and does not treat visibility as inference approval. The existing key returned HTTP 404 for Cyber model visibility; no Cyber inference has been attempted.

## Acceptance still required

- [x] Store the existing OpenAI key directly in the dev API secret store.
- [x] Complete the private GitHub App's creation and selected-repository installation.
- [x] Confirm exact owner identity and signed Access session against the generated profile.
- [x] Deploy the private API and M5 web code only to dev, preserving Access.
- [x] Complete live model and sandbox execution/denied-network probes.
- Import the real failed practice check, then press Diagnose, Repair and Verify.
- Confirm a source-only patch, fresh passing GitHub checks on its SHA and a draft PR. Leave review and merge to the human.
- Record the actual trace, check run, commit and PR evidence before calling the real repair verified.

Private web version: `5f89eb7f-fff7-4bab-aa38-4853f68bbb34`. Anonymous HTTP checks after activation: private web/API 302, public preview 200, sandbox 401. These checks do not establish a working signed application session or live repair.

## Live acceptance: 14 November 2026

- Private owner session: HTTP 200; GitHub App lists only the practice repository and confirms owner write access.
- OpenAI: gpt-6-sol readiness response completed, HTTP 200. Cyber model visibility: HTTP 404; this is not an inference-access approval.
- Sandbox: Node script returned exit 0 and the expected marker; a bounded direct TCP probe to 1.1.1.1:443 returned exit 0 after denial, then the sandbox was deleted. Both probes passed again after removing the temporary cleanup handler.
- An exact stopped probe instance from earlier failed startup races was reclaimed through a temporary bearer-protected dev handler. That handler and its caller were removed from source and redeployed. Old pool namespaces are retained for their existing alarms; new sessions use GreenCIPool. No repository data had entered those probe containers.
- CI import: GitHub check runs are readable, but `/commits/<sha>/status` returned HTTP 403. The prepared patch requests `statuses: read` in the App manifest and downscoped installation token. GitHub reauthentication and permission confirmation are pending. No permission failure is ignored during verification.

Current observed deployment versions: private API `1399537c-3569-4e91-92d6-a33adbf2a24e`; sandbox `2b72aa6f-1939-4b1c-9477-4e3dd71c60e7`. The commit-status permission patch is not deployed yet.

Offline gate after the session, pool and permission fixes: lint and all 18 typechecks pass; 71 tests across 14 files pass; core coverage remains 100% statements/branches/functions/lines; all 18 builds and seven browser journeys pass. Tests use synthetic credentials, fake models and mocked GitHub. Live provider probes are separate operator acceptance actions.
