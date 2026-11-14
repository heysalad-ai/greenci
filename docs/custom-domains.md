# GreenCI custom domains — dev only

Requested mapping: greenci.dev to greenci-preview-dev; beta.greenci.dev to greenci-web-dev. Both custom domains are attached in the Cloudflare dashboard to the existing dev-named Workers. Cloudflare labels each standalone Worker deployment as Production in its dashboard; these are still the greenci-*-dev resources, not the repository staging/production environments.

## Activation pending — 14 November 2026

The new greenci.dev Free zone is in HeySalad Inc. Cloudflare assigned fatima.ns.cloudflare.com and glen.ns.cloudflare.com. Current authoritative nameservers remain dns1.registrar-servers.com and dns2.registrar-servers.com. Namecheap sign-in is required to update them. Do not claim either custom hostname is live until DNS, TLS and HTTP are verified.

The automatic import preserved five existing Namecheap email-forwarding MX records and the SPF TXT record. The imported apex A parking record (192.64.119.105, Proxied, Auto TTL) conflicted with Worker attachment and was removed only from the new Cloudflare zone; it can be restored with those values if needed. Existing registrar DNS is unchanged. The www parking CNAME was retained; no www redirect was requested. Check the registrar for uncommon/unscanned records and confirm email-forwarding support before nameserver cutover.

## Private boundary

The existing greenci-web-dev Worker policy is All traffic, Cloudflare account members Allow, with policies attached directly to the Worker that move with its URLs. No Access policy or identity membership was changed. Its AUD matches the deployed API beta profile. The API still independently verifies the signed assertion and configured owner. Do not create an unprotected beta route or broaden the owner allowlist.

After authoritative activation, change only the generated dev API profile WEB_URL to https://beta.greenci.dev, then deploy that generated beta configuration using --env dev. Keep API_URL, BETA_ACCESS_AUD, owner identity, credentials and all other runtime bindings unchanged. Update beta:prepare to preserve the chosen canonical URL before rerunning it; its current default is the workers.dev URL. Until activation, leave the deployed WEB_URL unchanged so the existing private app continues to work.

Tracked custom_domain routes are present only in the two web dev configurations so a future dev deploy preserves the dashboard attachments. No new Worker version or API configuration was deployed during preparation.

## Remaining acceptance

- [ ] Verify imported DNS against the registrar, then save Cloudflare nameservers at Namecheap.
- [ ] Confirm Cloudflare zone active, authoritative delegation and TLS certificates.
- [ ] Run scripts/smoke-public-preview.mjs https://greenci.dev and inspect the landing page.
- [ ] Verify anonymous beta /app and API endpoints require Access, plus old private workers.dev URLs remain protected.
- [ ] Update dev canonical WEB_URL and verify signed session, run detail and allowed-origin actions through beta.greenci.dev.
- [ ] Record deployed versions and proof. No staging/production deployment, merge or approval.
