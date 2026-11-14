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

# Copy runtime assets with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web ./apps/web
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER nextjs

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
