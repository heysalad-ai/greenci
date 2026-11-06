# ActionKey

The on-screen twin of the physical deck: one charcoal command key and three emerald action keys, Diagnose, Repair and Verify, always in that order.

- Markup: `<button class="gc-key"><span><svg…/>Diagnose</span></button>`; the command key adds `gc-key--command`; group them in `gc-deck`.
- Use it wherever the person can trigger the same action as the hardware: the web app run view, the mobile run screen, onboarding.
- Pressing a physical key highlights its on-screen twin (`is-pressed`, then `is-busy` while the agent works) so the two always agree.
- Legends are one uppercase word in `label`. Icons: magnifier (Diagnose), wrench (Repair), shield-check (Verify), prompt (Command).
