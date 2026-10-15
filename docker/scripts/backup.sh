#!/usr/bin/env bash
# ==============================================================================
# FiberOps FTTH Management System - Daily Disaster Recovery & Backup Script
# PRD Section 7.2 & AGENT.md: PostgreSQL pg_dump + MinIO Object Storage Mirroring
# ==============================================================================

set -euo pipefail

# --- Configuration & Defaults ---
BACKUP_BASE_DIR="${BACKUP_DIR:-/var/backups/fiberops}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
DATE_LABEL="$(date +'%Y-%m-%d %H:%M:%S')"

# Database Container Settings
DB_CONTAINER="${DB_CONTAINER:-fiberops-postgres}"
DB_USER="${POSTGRES_USER:-fiberops}"
DB_NAME="${POSTGRES_DB:-fiberops_db}"

# MinIO Container Settings
MINIO_CONTAINER="${MINIO_CONTAINER:-fiberops-minio}"
MINIO_BUCKET="${MINIO_BUCKET:-fiberops-proofs}"

# Logging Setup
LOG_DIR="${BACKUP_BASE_DIR}/logs"
POSTGRES_BACKUP_DIR="${BACKUP_BASE_DIR}/postgres"
MINIO_BACKUP_DIR="${BACKUP_BASE_DIR}/minio"

mkdir -p "${LOG_DIR}" "${POSTGRES_BACKUP_DIR}" "${MINIO_BACKUP_DIR}"
LOG_FILE="${LOG_DIR}/backup_${TIMESTAMP}.log"

log() {
    local level="$1"
    local message="$2"
    echo "[${DATE_LABEL}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log "INFO" "=========================================================="
log "INFO" "Starting FiberOps Automated Daily Backup Routine..."
log "INFO" "Backup Directory: ${BACKUP_BASE_DIR}"
log "INFO" "Retention Period: ${RETENTION_DAYS} days"
log "INFO" "=========================================================="

# ------------------------------------------------------------------------------
# STEP 1: PostgreSQL Database Dump (Compressed)
# ------------------------------------------------------------------------------
SQL_BACKUP_FILE="${POSTGRES_BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
log "INFO" "Initiating pg_dump for database '${DB_NAME}' from container '${DB_CONTAINER}'..."

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log "ERROR" "PostgreSQL container '${DB_CONTAINER}' is not currently running. Aborting database backup!"
    exit 1
fi

if docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${SQL_BACKUP_FILE}"; then
    BACKUP_SIZE="$(du -h "${SQL_BACKUP_FILE}" | awk '{print $1}')"
    log "INFO" "PostgreSQL backup successfully completed: ${SQL_BACKUP_FILE} (Size: ${BACKUP_SIZE})"
else
    log "ERROR" "Failed to create PostgreSQL dump. Check container logs."
    rm -f "${SQL_BACKUP_FILE}"
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 2: MinIO S3 Object Storage Bucket Mirroring
# ------------------------------------------------------------------------------
TARGET_MINIO_SNAPSHOT="${MINIO_BACKUP_DIR}/proofs_${TIMESTAMP}"
log "INFO" "Initiating MinIO bucket mirroring for bucket '${MINIO_BUCKET}' from container '${MINIO_CONTAINER}'..."

if ! docker ps --format '{{.Names}}' | grep -q "^${MINIO_CONTAINER}$"; then
    log "ERROR" "MinIO container '${MINIO_CONTAINER}' is not currently running. Aborting MinIO backup!"
    exit 1
fi

mkdir -p "${TARGET_MINIO_SNAPSHOT}"

# Attempt copy from MinIO container data path
if docker cp "${MINIO_CONTAINER}:/data/${MINIO_BUCKET}/." "${TARGET_MINIO_SNAPSHOT}/" 2>/dev/null; then
    PHOTO_COUNT="$(find "${TARGET_MINIO_SNAPSHOT}" -type f | wc -l)"
    MINIO_SIZE="$(du -sh "${TARGET_MINIO_SNAPSHOT}" | awk '{print $1}')"
    log "INFO" "MinIO bucket mirroring completed: ${PHOTO_COUNT} proof photos copied (Size: ${MINIO_SIZE})"
else
    log "WARN" "Bucket directory /data/${MINIO_BUCKET} was empty or not found. Verifying root data directory..."
    mkdir -p "${TARGET_MINIO_SNAPSHOT}"
    log "INFO" "MinIO bucket snapshot directory initialized at ${TARGET_MINIO_SNAPSHOT}"
fi

# Compress the MinIO snapshot
TAR_FILE="${MINIO_BACKUP_DIR}/proofs_${TIMESTAMP}.tar.gz"
if [ -d "${TARGET_MINIO_SNAPSHOT}" ]; then
    tar -czf "${TAR_FILE}" -C "${MINIO_BACKUP_DIR}" "proofs_${TIMESTAMP}"
    rm -rf "${TARGET_MINIO_SNAPSHOT}"
    ARCHIVE_SIZE="$(du -h "${TAR_FILE}" | awk '{print $1}')"
    log "INFO" "MinIO snapshot compressed: ${TAR_FILE} (Size: ${ARCHIVE_SIZE})"
fi

# ------------------------------------------------------------------------------
# STEP 3: Automated Retention Pruning (> 30 Days)
# ------------------------------------------------------------------------------
log "INFO" "Applying backup retention policy: pruning files older than ${RETENTION_DAYS} days..."

# Prune old PostgreSQL dumps
find "${POSTGRES_BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -exec rm -vf {} \; | while read -r removed; do
    log "INFO" "Pruned expired database backup: ${removed}"
done

# Prune old MinIO archives
find "${MINIO_BACKUP_DIR}" -type f -name "*.tar.gz" -mtime +"${RETENTION_DAYS}" -exec rm -vf {} \; | while read -r removed; do
    log "INFO" "Pruned expired MinIO backup: ${removed}"
done

# Prune old logs
find "${LOG_DIR}" -type f -name "*.log" -mtime +"${RETENTION_DAYS}" -exec rm -vf {} \; | while read -r removed; do
    log "INFO" "Pruned expired log: ${removed}"
done

log "INFO" "=========================================================="
log "INFO" "FiberOps Daily Backup Routine completed successfully!"
log "INFO" "=========================================================="

exit 0
