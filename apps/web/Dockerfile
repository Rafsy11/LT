FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @repo/database run db:generate || true
RUN pnpm --filter @repo/web run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
