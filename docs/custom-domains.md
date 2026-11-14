# GreenCI custom domains — dev only

Requested mapping: greenci.dev to greenci-preview-dev; beta.greenci.dev to greenci-web-dev. Both custom domains are attached in the Cloudflare dashboard to the existing dev-named Workers. Cloudflare labels each standalone Worker deployment as Production in its dashboard; these are still the greenci-*-dev resources, not the repository staging/production environments.

## Domain active; HTTPS validation pending — 14 November 2026

The new greenci.dev Free zone is in HeySalad Inc. Cloudflare assigned fatima.ns.cloudflare.com and glen.ns.cloudflare.com. Previously the nameservers were dns1.registrar-servers.com and dns2.registrar-servers.com. Namecheap Custom DNS was saved in the user-signed-in Safari session on 14 November 2026. The .dev registry now delegates to fatima/glen; Cloudflare now marks the zone active and its public resolver reports the new delegation. Do not claim either custom hostname is live until DNS, TLS and HTTP are verified.

The automatic import preserved five existing Namecheap email-forwarding MX records and the SPF TXT record. The imported apex A parking record (192.64.119.105, Proxied, Auto TTL) conflicted with Worker attachment and was removed only from the new Cloudflare zone; it can be restored with those values if needed. Existing Namecheap parking records were reviewed before cutover: www CNAME and apex URL redirect only; no email forwarders were configured. DNSSEC was already off. Registrar delegation is now changed to Cloudflare; no email-forwarding migration was required. The www parking CNAME was retained; no www redirect was requested.

## Private boundary

The existing greenci-web-dev Worker policy is All traffic, Cloudflare account members Allow, with policies attached directly to the Worker that move with its URLs. No Access policy or identity membership was changed. Its AUD matches the deployed API beta profile. The API still independently verifies the signed assertion and configured owner. Do not create an unprotected beta route or broaden the owner allowlist.

After authoritative activation, change only the generated dev API profile WEB_URL to https://beta.greenci.dev, then deploy that generated beta configuration using --env dev. Keep API_URL, BETA_ACCESS_AUD, owner identity, credentials and all other runtime bindings unchanged. The tracked dev API WEB_URL is now beta.greenci.dev, so beta:prepare will preserve that canonical origin on the next generation. Its Access-audience discovery continues to use the existing protected workers.dev hostname of the same Worker policy. Until activation, leave the deployed WEB_URL unchanged so the existing private app continues to work.

Tracked custom_domain routes are present only in the two web dev configurations so a future dev deploy preserves the dashboard attachments. No new Worker version or API configuration has been deployed for this domain migration. The prepared generated dev profile uses beta.greenci.dev, but the serving API keeps its workers.dev origin until managed HTTPS is ready.

## Remaining acceptance

- [x] Verify imported DNS against the registrar, then save Cloudflare nameservers at Namecheap.
- [x] Confirm Cloudflare zone active and authoritative delegation.
- [ ] Confirm managed TLS certificates active.
- [ ] Run scripts/smoke-public-preview.mjs https://greenci.dev and inspect the landing page.
- [ ] Verify anonymous beta /app and API endpoints require Access, plus old private workers.dev URLs remain protected.
- [ ] Update dev canonical WEB_URL and verify signed session, run detail and allowed-origin actions through beta.greenci.dev.
- [ ] Record deployed versions and proof. No staging/production deployment, merge or approval.

## Checks during propagation

The .dev registry nameservers report fatima/glen. Cloudflare now shows “Your domain is now protected by Cloudflare”. Managed Universal and custom-domain certificates are Pending Validation (TXT); Cloudflare displays that it validates them automatically. Authoritative DNS publishes their challenge records. Authoritative A records now resolve for both custom hostnames. An anonymous HTTP request pinned to the authoritative Cloudflare edge returns 200 with the real public landing markers; beta HTTP redirects to HTTPS (301). HTTPS handshakes still fail while the managed primary certificate is pending, so secure custom-domain smoke and signed beta session remain unverified. A backup certificate is issued, which is not an active primary certificate. A bounded five-minute readiness check did not pass; no certificate verification was bypassed. Existing public workers.dev returns 200; private workers.dev returns 302 to Access. Both web configuration dry-runs, the generated dev API dry-run, lint, 18 typechecks, 74 tests and 18 builds pass. The first browser-test server startup hit SQLITE_BUSY_RECOVERY; two subsequent runs each passed all seven browser journeys. No new Worker version or secret was changed.
