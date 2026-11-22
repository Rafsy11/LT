FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate

FROM base AS builder
WORKDIR /app
COPY . .
ENV NEXT_PHASE=phase-production-build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/database run db:generate
RUN pnpm --filter @repo/web run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Create unprivileged system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy read-only standalone runtime assets owned by root:root (not writable by nextjs user)
COPY --from=builder --chown=root:root /app/apps/web/.next/standalone ./
COPY --from=builder --chown=root:root /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=root:root /app/apps/web/public ./apps/web/public

USER nextjs

WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "server.js"]
