# AGENTS.md: rules for coding agents in this repo

GreenCI is a physical command deck for AI coding agents: one command key and three action keys, Diagnose, Repair and Verify. The build brief is `docs/CODEX_PROMPT.md`. Read it before writing code.

## Source of truth

- Visuals and copy: `design/screens/*.png` and `design/static/*.html`. Match them.
- Tokens and component CSS: `design-system/tokens.json`, `tokens.css`, `components.css`. Never add a colour, font or radius that isn't a token.
- Voice: `design-system/BRAND.md` (fact first, name the next key, honest about misses, no hype, no emoji in UI).
- Logos and key faces: `design-system/assets/`. Never redraw them.

## Safety rules (never break these)

1. Push only to `greenci/*` branches. Never push to a default or protected branch.
2. Never merge or approve a pull request.
3. Never read, log or modify secrets or `.env*` files, and never send them to a model.
4. Never claim a fix is verified unless every verify check passed.
5. Never call a real LLM or real GitHub from tests. Use `AGENT_PROVIDER=fake` and `GITHUB_MODE=mock`.

## How to work

- Milestones are in `docs/CODEX_PROMPT.md` §11. Finish one, run `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm e2e` from M5), update `PROGRESS.md`, commit.
- Decisions you had to make go in `docs/decisions.md`, one paragraph each.
- Keep every user-facing string in `packages/core/src/copy.ts`.
- TypeScript strict, Zod at every boundary, no `any` without a comment saying why.
