# GreenCI pad: Axiometa bench prototype

## Observed on 14 November 2026

Peter describes screen on AX22 port 1, microphone on port 2, green-cap tactile LED buttons on ports 3 and 4. IMG_7713.HEIC shows the four-module assembly, lit display, two lit button modules and USB power. This establishes visible power/display output, not button-event or microphone acceptance.

Mac currently enumerates /dev/cu.usbmodem3101 as Espressif USB JTAG/serial, serial suffix AB:82:24. The older encoder chat used suffix AB:74:18. Do not assume these are the same controller or reuse the old encoder firmware. No firmware was flashed or GPIO driven in this investigation.

The display shows a music-related title and a LAN address. A read-only request to the displayed address returned a music-player page, with volume/status endpoints but no exposed brightness control. The LAN responder is not yet correlated to the USB controller by MAC or firmware identity; do not use its controls or assume it is the same device.

## Proposed first controls

- Screen: selected repo/run, current phase, result, and next button action.
- Port 3: Diagnose; after diagnosis, an explicit new press starts Repair. Ignore held-button repeat and presses during a running action.
- Port 4: Verify; show the result and draft PR link on the screen. Never merge a PR from the pad.
- Microphone: optional later push-to-talk input with a visible recording indicator. First acceptance is local level detection, not continuous recording or audio upload.

Confirm the control mapping with physical feedback before enabling repair dispatch. A USB companion can keep GitHub/OpenAI credentials on the computer rather than on the pad. Initially use mock actions for input tests; live actions must retain app authorization, expected-state and approval guards.

## Brightness

Axiometa AX22-0050 has a white LED beneath a colored cap, independently controlled from the switch. Official specifications list a 22 x 22 mm module, 12 mm switch and four diameter-2.7 mm mounting holes. These are nominal module references, not measurements of the whole installed stack.

Use PWM on the verified LED-control signal, beginning at about 5% duty and checking actual comfortable brightness. This is a proposed trial setting, not measured light output. Confirm schematic, port mapping, polarity and existing firmware first. Do not drive button, screen or microphone signals with PWM. Preserve the running firmware and take a restorable flash backup before any replacement.

References: https://www.axiometa.io/products/tactile-led-button and https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html .

## Circuit acceptance before enclosure

- [ ] Identify this exact controller, revision, current firmware and recovery route.
- [ ] Record port-3/4 press and release separately; 20 presses each without missed or duplicate events.
- [ ] Both LEDs independently dim/off and remain comfortable after reboot.
- [ ] Screen shows real input events and GreenCI state transitions.
- [ ] Optional local microphone-level response; no recording/transmission by default.
- [ ] Mock journey, then authorised real practice-repo journey through the existing private beta.

## Enclosure direction and caliper measurements

Keep this compact four-module arrangement. Start with a screw-fastened open bench tray and a removable top bezel; preserve access to USB, reset/boot and every connector. Add separate button openings and a microphone opening clear of plastic. Do not use the USB plug to support the device.

Before generating a fit STL, measure: assembled board width/length, mounting-hole centre distances and hole diameter, underside-to-tallest-component height, button spacing and released/pressed heights, screen visible window and outer size, USB plug body/cable clearance, and underside protrusions. Record readings in mm from a shared board-edge datum. No enclosure fit or final dimensions are inferred from this perspective photo.

Use USB power first. Battery selection follows confirmation of the actual board input range, connector polarity, charging/power-path support and measured current. No battery was connected or battery runtime established here.
