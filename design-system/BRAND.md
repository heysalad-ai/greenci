GreenCI is a physical command deck for AI coding agents: one command key and three green action keys, **Diagnose**, **Repair** and **Verify**. It investigates failed GitHub CI checks, prepares bug-fix PRs and proves the fix worked. The brand is practical, confident, playful and made for developers.

## Brand idea

**Red to green, one key at a time.** Every touchpoint tells the same short story: something failed, you pressed a key, it went green. The smiling key is the hero of that story; it changes mood as the run moves on.

- Tagline: “Red to green, one key at a time.” Short form: “Press green.”
- One-line description: “GreenCI is a command deck that turns failed CI checks into verified fix PRs.”
- Name: always **GreenCI**, one word, capital G, C and I. Never Green CI, Greenci, GREENCI or GCI. In running text the whole name is `ink`; only the logo colours “CI” emerald.

## Logo and mascot

- Use the **Logos** asset group; never retype or redraw. The default is `greenci-logo.svg` on `surface` or white, `greenci-logo-on-dark.svg` on `deck`.
- One-colour reproduction uses `greenci-logo-black.svg` / `greenci-logo-white.svg`. Under 20px use `greenci-favicon.svg`.
- The key has seven moods (**Moods** group). Show the mood that matches the run state: ready, diagnosing, repairing, verifying, failing, passing, shipped. See the Mascot component for copy pairings.
- Keep the charcoal base lip in every use. It is the brand's signature detail and appears again in buttons (`shadow-key`) and cards.

## Colour

- Emerald and charcoal carry the brand. Lead with `deck` (charcoal) and `brand` (emerald) in marketing; lead with `surface` and `ink` in product, letting emerald mark only what is green or actionable.
- Text in emerald uses `brand-ink`, never `brand` (too light for small text on white). Primary buttons use `action` with `on-action`.
- Status colours mean one thing each: `fail` failing, `work` agent in progress, `wait` needs a person, `brand-ink` passing. Each always comes with a word or icon, so no state depends on telling red from green.
- No gradients anywhere. Flat fields, hairlines (`line`) and the key lip do all the depth.
- Both themes are first-class. The physical deck colours (`deck`, `deck-lip`, `on-deck`) stay the same in both.

## Typography

- Headlines: `display-xl`, `display-l`, `display-m` in Bricolage Grotesque. Use sentence case and keep them short; one idea per headline.
- Interface and long text: `body`, `title`, `small` in Geist. Key legends, chips and eyebrows: `label` (uppercase, tracked).
- Anything a developer would type or read in a terminal (commands, SHAs, branch names, file paths, logs) is `code` in Geist Mono, inline on `surface-sunken`.
- The wordmark is outlined artwork, not a font. Don't set “GreenCI” in Bricolage as a logo.

## Layout, shape and motion

- 4px grid; spacing from `space-1` to `space-8`. Cards pad `space-4`, panels `space-5`, page gutters `space-6` desktop and `space-4` mobile.
- Corners: `radius-lg` for cards (it echoes the keycap), `radius-md` for controls, `radius-sm` for chips, `radius-key` (a fifth of the width) for anything shaped like a key or app icon.
- Elevation: borders first. `shadow-raise` only for things that float (toasts, menus, sheets); `shadow-key` only for pressable keys.
- Motion is mechanical and quick: keys travel down 3–5px in 80ms; panels slide 160ms ease-out; the spinner is a single rotating arc. Respect `prefers-reduced-motion` everywhere. One celebratory moment per run: when checks turn green the key face swaps to “passing” with a 200ms pop.
- Focus ring: 2px solid `focus` with 2px offset on every interactive element.

## Voice

GreenCI talks like a calm senior engineer pairing with you at 2am: specific, brief, a little dry, never cute about failures.

- **Lead with the fact.** “test (ubuntu) failed on main.” Not “Uh oh! Something went wrong.”
- **Name the next key.** Every status message ends with what to press or type: “Press Repair to open a fix PR.”
- **Show your work, briefly.** “Cause: expired fixture date in tests/billing.spec.ts:41.” One line, a file and a line number.
- **Earn the playfulness.** Jokes go on success moments and swag, never on errors, billing or anything that blocks someone.
- **Second person, active voice, sentence case.** “You”, never “the user”. GreenCI refers to itself in the first person sparingly: “I re-ran 12 checks” is fine in chat-like surfaces; system messages stay impersonal.
- **No hype words:** revolutionary, magic, seamless, effortless, AI-powered, supercharge. No emoji in product UI. One ✔ or ✕ glyph in the CLI.
- **Honest about limits.** “I couldn't reproduce this locally. Here's what I tried.” Never claim a fix is verified until checks have actually re-run.

| Moment | Write | Not |
| --- | --- | --- |
| Failure | “2 checks failing on main since 09:14.” | “Oh no, your build broke!” |
| Working | “Reading 1,284 log lines…” | “Our AI is thinking really hard…” |
| Success | “Green again. 12/12 checks passing.” | “Success!!! 🎉” |
| Needs a person | “The fix touches a migration. Review it before I open a PR.” | “Action required.” |
| Error (ours) | “GitHub didn't answer. Retrying in 30s.” | “An unexpected error occurred.” |
| Empty | “All green. Nothing to fix.” | “No data.” |

## Iconography

- Line icons on a 24px grid, 2px stroke, round caps and joins, `currentColor`. Core set: check, cross, magnifier (Diagnose), wrench (Repair), shield-check (Verify), prompt (Command), clock (waiting), pull request.
- Status icons always pair with a word. No filled or duotone icons; no emoji as icons.
- The key mood faces are illustrations, not icons: use them at 24px or larger, one at a time.

## Imagery

- Product photography: the deck on a real desk, top-down or low three-quarter, soft daylight, a laptop with a real terminal nearby. Emerald keys are the only saturated colour in frame.
- Illustration: flat keycaps and terminals built from the tokens, never 3D renders, robots or glowing brains.
