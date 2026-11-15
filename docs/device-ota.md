# Wi-Fi pad control and OTA — dev only

Owner page: https://beta.greenci.dev/app/device (also the app's Deck navigation).
The physical dev pad is Genesis Mini AB8224: P1/P4 tactile buttons/LEDs, P2 display,
P3 microphone. It is separate from the encoder board ending AB7418.

The page supports Off/Minimum/5%/20% per LED, Home, Restart, firmware preparation
and an explicit Install action. It shows the device's own version, active slot,
command result, last heartbeat and healthy-boot status. A queued command is never
called acknowledged until a matching or newer command sequence arrives from the
device. CI keys remain a local mock journey; this feature does not dispatch real
repairs or expose remote microphone capture.

## Dev isolation

- `greenci-device-gateway-dev` exposes only POST `/device/poll` and GET
  `/device/image/<sha256>`. Missing/wrong device credentials return 401; operator
  paths return 404. It has a service binding to the private relay.
- `greenci-device-relay-dev` has no public routes, workers.dev hostname or preview
  URLs. Its single SQLite Durable Object stores sequenced, expiring commands and
  bounded status/release metadata. Binaries live under `devices/ab8224/` in the
  existing dev artifact bucket. No staging/production resources are used.
- `/v1/device/status`, `/v1/device/command`, `/v1/device/release?version=…` require
  dev beta mode, the existing session and owner membership. Cookie-authenticated
  changes retain CSRF validation. Cloudflare Access on the private web/API remains
  enabled. The API reaches the relay over a service binding; it needs no operator
  credential that can leak into the browser.
- A random per-device secret is provisioned to the relay via Wrangler stdin and
  to the physical pad over USB. No key values enter source, logs, chat or binaries.

The device uses outbound HTTPS with the ESP certificate bundle and SNTP, a fixed
hostname, and no redirects. HMAC commands bind sequence, typed operation, value,
release SHA-256, size, version and five-minute expiry. The device persists sequence
before effects and writes updates to the inactive application slot. Transfer
length, SHA-256, ESP image checks and matching application project name must pass
before activation. A rollback-enabled bootloader handles failed trial boots.

The pad independently polls Cloudflare; the Mac/setup page is not a runtime
bridge. It still needs power. Battery operation and cold-start behavior are not
proved by an OTA test.

## Firmware source and recovery

Source in the companion Firmware_Mgmt workspace:
`greenci-pad/firmware/greenci_pad_remote`, with `REMOTE.md`,
`REMOTE-ACCEPTANCE.md`, guarded `migrate_remote.py`, `setup_remote.py`,
`remote_target.py`, and `bootloader-project/`.
The companion source is checkpointed locally on `codex/greenci-wireless-ota` at
`33f9f25` in `Product_Mgmt/work/greenci-firmware-wireless`; the runtime copy is in
`Firmware_Mgmt`. The original 0.2.2 firmware source remains unchanged. Its private 4 MiB backup
was hash-verified against the exact device before migration; no NVS was parsed.
A first USB migration created two 0x1e0000-byte OTA slots while preserving NVS.

The live recovery test exposed Arduino 3.3.11 automatically confirming pending
OTA boots before setup(). The firmware overrides verifyRollbackLater() to defer
that confirmation until its own hardware/connectivity checks pass. The final
device also uses an explicit ESP-IDF v5.5.1 rollback-enabled bootloader; no eFuse,
Secure Boot or encryption settings were changed. See the firmware evidence ledger for actual acceptance.

## Deploy order

All commands use Node 22 and `--env dev`:

```sh
pnpm exec wrangler deploy --config apps/device-relay/wrangler.jsonc --env dev
pnpm exec wrangler deploy --config apps/device-gateway/wrangler.jsonc --env dev
# Pair DEVICE_TOKEN through the one-time local setup flow, never a command argument.
pnpm beta:prepare peter@heysalad.io
pnpm exec wrangler deploy --config apps/api/wrangler.beta.generated.jsonc --env dev
pnpm --filter @greenci/web build:worker
pnpm exec wrangler deploy --config apps/web/wrangler.jsonc --env dev
```

Do not deploy the base API scaffold profile to the private beta. Existing
GitHub/OpenAI setup, repository permissions, repair history and public preview
are unchanged by device control.

## Verification

The worker-runtime tests reject unauthorized device requests, public operator
routes, unsupported operations/brightness, nonexistent releases and non-S3 image
headers; they verify HMAC construction, sequence acknowledgments and exact R2
round trips. The browser regression recreates a stale status response and proves
it cannot falsely acknowledge a new command. Other local checks remain fake
provider/mock GitHub only. Hardware observations are recorded separately in the
firmware evidence ledger; simulated checks are not physical evidence.

The sanitized live-device ledger is also copied to
[docs/evidence/device-ota-dev.json](evidence/device-ota-dev.json).

## LiPo voltage and labelled capacity

Firmware 0.4.2 adds GPIO8 battery-sense telemetry for the user-confirmed direct
3.7 V LiPo connection, labelled 1500 mAh. The schematic/Arduino variant specify
a 1/2 divider; the firmware uses the calibrated ADC API and filtered samples.
The optional battery payload preserves compatibility with older rollback images.
The beta page labels voltage **unverified**, separates labelled capacity from
estimated charge, and never presents remaining mAh/runtime as measured.

The live board reported approximately 2.69–2.70 V, which is unexpectedly low.
No multimeter is available, so neither absolute accuracy nor cell charge is
verified. Below 3.0 V or above 4.35 V, no percentage is provided. No inference
that the LiPo is charged by USB, no new charging/protection behavior, and no
battery-only runtime claim follows from this feature. Keep USB power available
until the low reading can be checked. The manufacturer's connector is documented
for AA/AAA packs. Physical screen visibility also remains unverified.

Companion source checkpoint: `codex/greenci-wireless-ota` / `f0ef7df`.
See [battery evidence](evidence/battery-dev.json) and the companion BATTERY.md.

## Voltage scaling audit — 0.4.3

A live audit found no obvious software scaling/calibration-wrapper error. Across
16 groups, GPIO8/ADC1_CH7 raw samples at 12-bit resolution converted to 1344–1359
mV using factory curve fitting. Arduino and explicit ESP-IDF conversion differed
by at most 3 mV. Both 6 dB and 12 dB ranges were unsaturated, and settled sampling
did not expose a large sampling error. The documented 2:1 divider yields ~2.7 V.

The earlier per-pin attenuation call preceded channel initialization. It was
ineffective, but the default already matched the intended range; replacing it
with explicit global setup did not change the result to 3.7 V. No arbitrary
voltage correction factor was applied. A bounded USB-only BATTERY DIAG command
now compares raw counts and both conversion paths and restores normal sampling.

The user cannot disconnect the LiPo because the device is permanently sealed.
A disconnected-input test, physical resistor measurements and independent
cell-terminal voltage measurements were therefore unavailable. ADC-method
agreement is not independent metrology. The app retains its unverified-voltage
label and withholds percentage at this reading. Source checkpoint: 65d9c0e.
See [voltage audit evidence](evidence/voltage-audit-dev.json).
