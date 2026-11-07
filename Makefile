.PHONY: dev test e2e seed reset

dev:
	pnpm dev

test:
	pnpm lint && pnpm typecheck && pnpm test

e2e:
	pnpm e2e

seed:
	pnpm seed

reset:
	pnpm reset
