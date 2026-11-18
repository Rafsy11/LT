pnpm db:generate
pnpm --filter @repo/web build
docker exec -u root fiberops-web rm -rf /app/apps/web/.next
docker cp apps/web/.next fiberops-web:/app/apps/web/.next
docker exec -u root fiberops-web sh -c "cp /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine* /app/apps/web/.next/server/ 2>/dev/null || true"
docker exec -u root fiberops-web chown -R nextjs:nodejs /app/apps/web/.next
docker restart fiberops-web fiberops-nginx
Write-Host "✓ Sinkronisasi ke Docker selesai!" -ForegroundColor Green
