# Build from the repository root: docker build -f apps/worker/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @greenci/worker... build
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["pnpm", "--filter", "@greenci/worker", "start"]
