function Assert-Success($step) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "GAGAL di tahap: $step (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# 1. Pastikan container hidup terlebih dahulu (jangan recreate)
$running = docker inspect -f "{{.State.Running}}" fiberops-web 2>$null
if ($running -ne "true") {
    Write-Host "Menyalakan container fiberops-web & fiberops-nginx..." -ForegroundColor Yellow
    docker start fiberops-web fiberops-nginx | Out-Null
    Assert-Success "docker start"
}

# 2. Generate Prisma & Build Web (berhenti jika gagal)
pnpm db:generate
Assert-Success "pnpm db:generate"

pnpm --filter @repo/web build
Assert-Success "pnpm --filter @repo/web build"

# 3. Hapus .next lama secara bersih & salin yang baru
docker exec -u root fiberops-web rm -rf /app/apps/web/.next
Assert-Success "rm -rf .next lama"

docker cp apps/web/.next fiberops-web:/app/apps/web/.next
Assert-Success "docker cp .next"

docker exec -u root fiberops-web sh -c "cp /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine* /app/apps/web/.next/server/ 2>/dev/null || true"
docker exec -u root fiberops-web chown -R nextjs:nodejs /app/apps/web/.next
Assert-Success "chown .next"

# 4. Restart container
docker restart fiberops-web fiberops-nginx | Out-Null
Assert-Success "docker restart"

# 5. Verifikasi BUILD_ID lokal vs Docker
$localId  = (Get-Content apps/web/.next/BUILD_ID -Raw).Trim()
$dockerId = (docker exec fiberops-web cat /app/apps/web/.next/BUILD_ID).Trim()

if ($localId -eq $dockerId) {
    Write-Host "OK! Sinkronisasi terverifikasi (BUILD_ID: $dockerId)" -ForegroundColor Green
} else {
    Write-Host "PERINGATAN: BUILD_ID tidak cocok! Lokal=$localId | Docker=$dockerId" -ForegroundColor Red
    exit 1
}
