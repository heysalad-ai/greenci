# GreenCI custom domains — verified in dev

Status: managed HTTPS is active for greenci.dev and beta.greenci.dev. The dev API uses https://beta.greenci.dev as its canonical web origin. Signed owner session creation, repository access, dashboard and real run detail were verified on the custom beta hostname on 14 November 2026. Access remains enabled and no staging/production service was deployed.

## Domain mapping

| Hostname                 | Worker              | Purpose                                        |
| ------------------------ | ------------------- | ---------------------------------------------- |
| https://greenci.dev      | greenci-preview-dev | Public, read-only landing and product captures |
| https://beta.greenci.dev | greenci-web-dev     | Access-protected private beta                  |

Namecheap delegates greenci.dev to fatima.ns.cloudflare.com and glen.ns.cloudflare.com in the HeySalad Inc. Cloudflare account. The zone is active; managed Advanced and Universal certificates show Active, with displayed expiry 12 February 2027. Cloudflare manages their renewal.

The registrar's pre-cutover records were reviewed: apex URL redirect, www parking CNAME, SPF and default email-forwarding configuration; no email forwarders were configured and DNSSEC was already off. Cloudflare imported the five default MX records and SPF TXT. Only the conflicting apex parking A record (192.64.119.105, Proxied, Auto TTL) was replaced by the public Worker attachment. The www parking CNAME was retained; a www redirect was not requested.

## Private boundary

The existing greenci-web-dev Worker policy requires Cloudflare account-member login on all traffic. It moves with the Worker across its URLs, including the new custom domain. No Access policy, membership or identity allowlist changed. The API still validates the signed Access JWT issuer, audience, signature, expiry and exact configured owner, then verifies repository write permission before creating its Secure/HttpOnly/SameSite session cookie.

Anonymous HTTPS requests to beta /app, /start and /api/health redirect to heysalad.cloudflareaccess.com with the same expected application audience. Existing private web/API workers.dev URLs remain Access-protected. No unprotected API custom domain was created; beta browser API calls continue through the web-to-API service binding.

## Dev deployment

Deployed only apps/api/wrangler.beta.generated.jsonc with --env dev. WEB_URL is https://beta.greenci.dev; API_URL, Access audience, owner identity, one-repository allowlist, src/** write scope, model/provider settings and runtime bindings remain unchanged. No credentials were read or changed.

| Worker              | Serving version                                  |
| ------------------- | ------------------------------------------------ |
| greenci-api-dev     | 2e8ed1c8-3429-47db-beb8-f47af2d52f3a             |
| greenci-web-dev     | d42d9935-b809-4861-9365-6586ed7c3d7b (unchanged) |
| greenci-preview-dev | 35474f3d-496d-485b-a476-d990ee546955 (unchanged) |

Tracked custom_domain routes are only in the two web dev configurations. The tracked dev API WEB_URL defaults to the beta hostname so beta:prepare preserves the canonical origin. Access-audience discovery still uses the existing protected workers.dev hostname of the same Worker policy. Deploy private beta API changes with the generated dev profile, not the scaffold profile. Cloudflare's dashboard labels standalone Worker deployments Production, but the resources above are the repository's dev-named Workers, not its staging/production environments.

## Acceptance evidence

- [x] Namecheap nameservers saved; registry, authoritative DNS and public-resolver delegation confirmed.
- [x] Primary managed certificates active; strict TLS validation succeeds on both hostnames.
- [x] Existing public-preview smoke script passes against https://greenci.dev: landing, gallery, docs, assets and health return 200; writes/API boundaries remain restricted. [Results](evidence/custom-domain-public-smoke.json).
- [x] Anonymous beta routes and old private endpoints require Access; beta redirect audience matches the deployed API configuration. [Results](evidence/custom-domain-private-boundary.json).
- [x] Signed owner session on https://beta.greenci.dev/start?deckless=1: Connect GitHub succeeds and lists only heysalad-ai/greenci-practice. This POST verifies the canonical browser origin and signed identity through the real API.
- [x] Authenticated https://beta.greenci.dev/app loads the real fixed run and preserved handed-back attempt. The successful run detail displays 1/1 checks passing and the existing draft PR #1. No new provider probe, repair, PR, approval or merge was triggered by this sign-in test.
- [x] Temporary local DNS preference restored to the original automatic Wi-Fi configuration; networksetup -getdnsservers Wi-Fi again reports no manually configured servers.

The Mac's primary ISP resolver retained the old negative response even after public DNS and HTTPS were ready. Peter explicitly approved temporarily preferring the already-configured secondary ISP resolver, 194.168.8.100, then restoring automatic DNS. Under that temporary preference the new hostname opened normally and signed session creation succeeded. Automatic DNS was then restored, and the browser loaded the real run detail afterward. A cold curl lookup through the primary ISP resolver still failed immediately after restoration; some fresh connections can remain affected until that upstream cache refreshes. No system DNS override remains installed and no TLS check was bypassed.

The public smoke used a test-process-only Cloudflare DNS resolver while the local ISP cache was stale; certificate verification remained enabled. It did not alter system DNS settings.

Local screenshots: /tmp/greenci-certificates-active.jpg, /tmp/greenci-custom-public-landing.jpg, /tmp/greenci-beta-custom-signin.jpg and /tmp/greenci-beta-custom-domain-verified.jpg. Local deployment log: /tmp/greenci-custom-domain-api-deploy.log.

Offline validation for the domain configuration: lint, 18 typechecks, 74 tests and 18 builds pass. One browser-test startup hit SQLITE_BUSY_RECOVERY; two subsequent runs each passed all seven browser journeys. Runtime sign-in and TLS acceptance above are separate live evidence. No source code changed after those gates; final edits record the observed deployment and verification.
