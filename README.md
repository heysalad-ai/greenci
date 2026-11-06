# GreenCI

**Red to green, one key at a time.** A HeySalad project.

GreenCI is a physical command deck for AI coding agents. It has one command key and three green action keys: **Diagnose**, **Repair** and **Verify**. When a GitHub check fails, GreenCI finds the cause, writes a fix on its own branch, re-runs every check, and then opens a pull request for you to review.

## What's in this repo today

| Path | What |
|---|---|
| `design-system/` | Brand book (`BRAND.md`), tokens (`tokens.json`, `tokens.css`), component CSS (`components.css`), one folder per component with guidelines and a live preview, logos and the seven key mood faces. |
| `design/screens/` | PNG renders of every approved screen: lifecycle journey, states, web dashboard, run detail, onboarding, CLI, mobile, hardware, landing page, emails, copy, promo, swag. |
| `design/static/` | The same screens as plain HTML, to copy markup and copy from. |
| `design/boards/` | Editable design sources from the design canvas. |
| `docs/CODEX_PROMPT.md` | The full end-to-end build brief for Codex: local first, then dev, staging and prod. |
| `AGENTS.md` | Working and safety rules for coding agents. |

## Build it

Open Codex at the root of this repo and paste the contents of `docs/CODEX_PROMPT.md`. It builds milestone by milestone (M0–M9) and keeps `PROGRESS.md` updated.

Target local experience once built:

```bash
cp .env.example .env
pnpm install
pnpm dev
```

## Brand at a glance

- Emerald `#0E9F6E` and charcoal `#23272E`. No gradients.
- Bricolage Grotesque for headlines, Geist for text, Geist Mono for anything a developer would type.
- The logo is the smiling keycap: two check-mark eyes and a smile. Always keep the charcoal base lip.

Logo and brand are concept work; no trademark search has been done yet.
