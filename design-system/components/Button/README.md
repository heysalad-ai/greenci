# Button

Buttons look and behave like keys: the primary button carries the keycap lip (`shadow-key`) and drops 3px when pressed.

- Markup: `<button class="gc-btn gc-btn--primary">`; variants `--secondary`, `--ghost`, `--danger`; size `--sm`. Put an icon `<svg>` first when it helps.
- One primary button per view. Its label is the exact action: “Open fix PR”, “Re-run checks”, “Pair deck”. Never “OK”, “Submit” or “Click here”.
- `--danger` only for actions that remove something (disconnect, revoke, delete). Confirm in the page, never in a browser dialog.
- While working, keep the button, disable it and change the label to the present tense: “Verifying…”.
