# Build from the repository root: docker build -f apps/mobile/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @greenci/mobile... build
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["node", "scripts/not-ready.mjs", "mobile", "M8"]
