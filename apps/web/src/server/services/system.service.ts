import os from 'node:os';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { prisma, Prisma } from '@repo/database';
import {
  SystemSettingsInput,
  SystemTelemetryData,
  BackupSnapshotItem,
  UserSessionContext,
  ERROR_CODES,
} from '@repo/shared';
import { redisManager } from '../lib/redis';
import { minioManager } from '../lib/minio';
import { ollamaClient } from '../lib/ollama';
import { env } from '../../env';
import {
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
} from '../lib/live-data';

const SETTINGS_REDIS_KEY = 'fiberops:system:settings';
const BACKUP_HISTORY_REDIS_KEY = 'fiberops:system:backups';
const WORKSPACE_CONFIG_KEY = 'workspace_config';

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsInput = {
  companyName: 'Lintasarta Nusantara Network',
  serverTimezone: 'Asia/Jakarta',
  publicAccessMethod: 'STATIC_IP_HTTPS',
  publicDomain: 'https://ftth-ops.lintasarta.co.id',
  geofenceRadiusMeters: 100,
  locationViolationPolicy: 'SOFT_WARNING',
  blockMockLocation: true,
  minAppVersion: '1.0.0',
  aiInferenceMode: 'GPU_ACCELERATED',
  selectedAiModel: env.OLLAMA_MODEL || 'qwen2.5:14b-instruct',
  maxConcurrentAiQueries: 1,
  aiMemoryLimitGb: 16,
  cronSchedule: '0 2 * * *',
  compressionEncrypted: true,
  secondaryBackupTarget: 'EXTERNAL_NAS',
  secondaryStoragePath: 'nas://192.168.1.100/volume1/ftth_backups',
  apkDownloadUrl: 'https://ftth-ops.lintasarta.co.id/download/technician-latest.apk',
  otaUpdateUrl: 'https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest',
};

let currentSettings: SystemSettingsInput = { ...DEFAULT_SYSTEM_SETTINGS };
let backupHistoryState: BackupSnapshotItem[] = [];

async function getDiskStatsGb(): Promise<{ totalGb: number; usedGb: number }> {
  try {
    const stat = await fs.statfs(process.cwd());
    const totalBytes = Number(stat.bsize) * Number(stat.blocks);
    const freeBytes = Number(stat.bsize) * Number(stat.bfree);
    const totalGb = Math.max(1, Math.round(totalBytes / 1024 / 1024 / 1024));
    const usedGb = Math.max(0, Math.round((totalBytes - freeBytes) / 1024 / 1024 / 1024));
    return { totalGb, usedGb };
  } catch {
    return { totalGb: 0, usedGb: 0 };
  }
}

async function probeOllamaRuntime(): Promise<{
  healthy: boolean;
  activeModel?: string;
  vramUsedGb?: number;
}> {
  const baseUrl = env.OLLAMA_BASE_URL.replace(/\/+$/, '');
  const healthy = await ollamaClient.isHealthy();
  if (!healthy) {
    return { healthy: false };
  }

  try {
    const psRes = await fetch(`${baseUrl}/api/ps`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    if (!psRes.ok) {
      return { healthy: true };
    }
    const psJson = (await psRes.json()) as {
      models?: Array<{ name?: string; size_vram?: number }>;
    };
    const active = psJson.models?.[0];
    const vramBytes = active?.size_vram || 0;
    return {
      healthy: true,
      activeModel: active?.name,
      vramUsedGb: vramBytes > 0 ? Number((vramBytes / 1024 / 1024 / 1024).toFixed(2)) : undefined,
    };
  } catch {
    return { healthy: true };
  }
}

async function probeNginxGateway(): Promise<'HEALTHY' | 'WARNING'> {
  if (process.env.NODE_ENV !== 'production') {
    return 'WARNING';
  }
  try {
    const res = await fetch('http://127.0.0.1/api/v1/health', {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    return res.ok ? 'HEALTHY' : 'WARNING';
  } catch {
    return 'WARNING';
  }
}

function formatBackupTimestamp(date: Date): string {
  return `${date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}, ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
}

async function hydrateSystemState(): Promise<void> {
  const dbReady = await requireLiveDatabase(
    'Koneksi database PostgreSQL diperlukan untuk memuat pengaturan sistem.',
  );

  if (dbReady) {
    try {
      const [configRow, backupRows] = await Promise.all([
        prisma.systemConfig.findUnique({ where: { key: WORKSPACE_CONFIG_KEY } }),
        prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      ]);

      if (configRow && configRow.value && typeof configRow.value === 'object') {
        currentSettings = {
          ...DEFAULT_SYSTEM_SETTINGS,
          ...(configRow.value as Partial<SystemSettingsInput>),
        };
      }

      backupHistoryState = backupRows.map((b) => ({
        id: b.id,
        timestamp: formatBackupTimestamp(b.createdAt),
        filename: b.filename,
        sizeMb: Number(b.sizeMb.toFixed(2)),
        target: b.target,
        sha256Checksum: b.sha256Checksum,
        photosCount: b.photosCount,
        status: b.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      }));
      return;
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal memuat konfigurasi sistem dari PostgreSQL.');
    }
  }

  try {
    const rawSettings = await redisManager.getKey(SETTINGS_REDIS_KEY);
    if (rawSettings) {
      currentSettings = {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...(JSON.parse(rawSettings) as Partial<SystemSettingsInput>),
      };
    }
    const rawBackups = await redisManager.getKey(BACKUP_HISTORY_REDIS_KEY);
    if (rawBackups) {
      const parsed = JSON.parse(rawBackups) as BackupSnapshotItem[];
      if (Array.isArray(parsed)) {
        backupHistoryState = parsed;
      }
    }
  } catch {
    // Non-strict test mode fallback
  }
}

export class SystemService {
  /**
   * Mengambil konfigurasi sistem aktif (PostgreSQL + Redis) beserta telemetri kesehatan real-time server.
   */
  static async getSystemSettings(): Promise<{
    settings: SystemSettingsInput;
    telemetry: SystemTelemetryData;
  }> {
    await hydrateSystemState();
    const isGpu = currentSettings.aiInferenceMode === 'GPU_ACCELERATED';

    const cpus = os.cpus();
    const totalMemGb = Math.max(1, Math.round(os.totalmem() / 1024 / 1024 / 1024));
    const freeMemGb = os.freemem() / 1024 / 1024 / 1024;
    const usedMemGb = Number(Math.max(0.1, totalMemGb - freeMemGb).toFixed(1));
    const loadAvg1m = os.loadavg()[0] || 0;
    const cpuUsagePct = Number(
      Math.min(99, Math.max(1, (loadAvg1m / Math.max(1, cpus.length)) * 100)).toFixed(1),
    );

    const [dbUp, redisUp, minioUp, minioStats, diskStats, ollamaStatus, nginxStatus] =
      await Promise.all([
        requireLiveDatabase().catch(() => false),
        redisManager.ping(),
        minioManager.isHealthy(),
        minioManager.getBucketUsageStats(),
        getDiskStatsGb(),
        probeOllamaRuntime(),
        probeNginxGateway(),
      ]);

    const appRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const telemetry: SystemTelemetryData = {
      cpuCores: cpus.length || 4,
      cpuModel: cpus[0]?.model?.trim() || 'On-Premise Server CPU',
      cpuUsage: cpuUsagePct,
      ramTotalGb: totalMemGb,
      ramUsedGb: usedMemGb,
      storageTotalGb: diskStats.totalGb,
      storageUsedGb: diskStats.usedGb,
      gpuModel:
        isGpu && ollamaStatus.activeModel
          ? `Ollama Active (${ollamaStatus.activeModel})`
          : undefined,
      gpuVramTotalGb: isGpu && ollamaStatus.vramUsedGb ? currentSettings.aiMemoryLimitGb : undefined,
      gpuVramUsedGb: ollamaStatus.vramUsedGb,
      containers: [
        {
          name: 'postgres-db',
          service: 'postgres',
          status: dbUp ? 'HEALTHY' : 'CRITICAL',
          cpuUsagePercent: 0,
          memoryUsageMb: 0,
          memoryLimitMb: 8192,
          details: dbUp
            ? 'PostgreSQL · Koneksi ACID aktif & sinkron'
            : 'PostgreSQL offline / tidak terjangkau pada DATABASE_URL',
        },
        {
          name: 'nextjs-web',
          service: 'nextjs-app',
          status: 'HEALTHY',
          cpuUsagePercent: cpuUsagePct,
          memoryUsageMb: appRssMb,
          memoryLimitMb: 4096,
          details: `Next.js 15 App Router · RSS ${appRssMb} MB`,
        },
        {
          name: 'redis-bus',
          service: 'redis',
          status: redisUp ? 'HEALTHY' : 'WARNING',
          cpuUsagePercent: 0,
          memoryUsageMb: 0,
          memoryLimitMb: 2048,
          details: redisUp
            ? 'Redis · Pub/Sub SSE & Rate Limiter aktif'
            : 'Redis tidak merespons PING (Fallback in-memory sementara)',
        },
        {
          name: 'minio-s3',
          service: 'minio',
          status: minioUp ? 'HEALTHY' : 'CRITICAL',
          cpuUsagePercent: 0,
          memoryUsageMb: 0,
          memoryLimitMb: 2048,
          details: minioUp
            ? `MinIO S3 aktif · ${minioStats ? `${minioStats.objectCount} objek (${(minioStats.totalBytes / 1024 / 1024).toFixed(2)} MB)` : 'Bucket ftth-evidence'}`
            : 'MinIO Object Storage tidak dapat dijangkau',
        },
        {
          name: 'ollama-inference',
          service: 'ollama-ai',
          status: ollamaStatus.healthy ? 'HEALTHY' : 'WARNING',
          cpuUsagePercent: 0,
          memoryUsageMb: ollamaStatus.vramUsedGb ? Math.round(ollamaStatus.vramUsedGb * 1024) : 0,
          memoryLimitMb: currentSettings.aiMemoryLimitGb * 1024,
          details: ollamaStatus.healthy
            ? `Ollama aktif · Model ${ollamaStatus.activeModel || currentSettings.selectedAiModel}`
            : `Ollama offline (${env.OLLAMA_BASE_URL}) · Asisten AI tidak tersedia`,
        },
        {
          name: 'nginx-gateway',
          service: 'nginx',
          status: nginxStatus,
          cpuUsagePercent: 0,
          memoryUsageMb: 0,
          memoryLimitMb: 1024,
          details:
            nginxStatus === 'HEALTHY'
              ? 'Nginx reverse proxy merespons healthcheck internal'
              : 'Reverse proxy Nginx tidak aktif pada port 80 lokal (direct Node mode)',
        },
      ],
      backupHistory: [...backupHistoryState],
    };

    return {
      settings: { ...currentSettings },
      telemetry,
    };
  }

  /**
   * Memperbarui konfigurasi sistem (Khusus Super Admin level 100) ke PostgreSQL SystemConfig & Redis.
   */
  static async updateSettings(
    actor: UserSessionContext,
    newSettings: SystemSettingsInput,
  ): Promise<SystemSettingsInput> {
    if (actor.hierarchyLevel < 100) {
      const err = new Error(
        `${ERROR_CODES.FORBIDDEN}: Hanya Super Admin yang berwenang mengubah konfigurasi sistem on-premise`,
      ) as Error & { code: string };
      err.code = ERROR_CODES.FORBIDDEN;
      throw err;
    }

    await hydrateSystemState();
    const oldSettings = { ...currentSettings };
    currentSettings = { ...newSettings };

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk menyimpan konfigurasi.')) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.systemConfig.upsert({
            where: { key: WORKSPACE_CONFIG_KEY },
            update: {
              value: currentSettings as unknown as Prisma.InputJsonValue,
              updatedBy: actor.userId,
            },
            create: {
              key: WORKSPACE_CONFIG_KEY,
              value: currentSettings as unknown as Prisma.InputJsonValue,
              updatedBy: actor.userId,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'SYSTEM_SETTINGS_UPDATED',
              targetEntity: 'system',
              targetId: WORKSPACE_CONFIG_KEY,
              oldPayload: oldSettings as unknown as Prisma.InputJsonValue,
              newPayload: currentSettings as unknown as Prisma.InputJsonValue,
            },
          });
        });
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan konfigurasi sistem ke PostgreSQL.');
      }
    }

    await redisManager.setPersistentKey(SETTINGS_REDIS_KEY, JSON.stringify(currentSettings));
    return { ...currentSettings };
  }

  /**
   * Menjalankan backup snapshot terkompresi (Gzip JSON + SHA-256) langsung ke MinIO & BackupRecord PostgreSQL.
   */
  static async triggerBackupSnapshot(actor: UserSessionContext): Promise<BackupSnapshotItem> {
    if (actor.hierarchyLevel < 50) {
      const err = new Error(
        `${ERROR_CODES.FORBIDDEN}: Minimal Admin Operasional atau Super Admin untuk memicu snapshot backup`,
      ) as Error & { code: string };
      err.code = ERROR_CODES.FORBIDDEN;
      throw err;
    }

    const dbReady = await requireLiveDatabase(
      'Koneksi database PostgreSQL diperlukan untuk mengekspor snapshot backup.',
    );
    await hydrateSystemState();

    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `ftth_snapshot_${dateStr}.json.gz`;
    const objectKey = `backups/${filename}`;
    const targetLabel =
      currentSettings.secondaryBackupTarget === 'EXTERNAL_NAS'
        ? `MinIO + NAS Target (${currentSettings.secondaryStoragePath})`
        : currentSettings.secondaryBackupTarget === 'ENCRYPTED_CLOUD_BUCKET'
          ? 'MinIO S3 Primary + Secondary Bucket'
          : 'MinIO S3 Vault Archive';

    let payloadData: Record<string, unknown> = {
      exportedAt: now.toISOString(),
      exportedBy: actor.username,
      settings: currentSettings,
    };
    let photosCount = 0;

    if (dbReady) {
      try {
        const [clusters, splitters, customers, tickets, roles, photosCountResult] =
          await Promise.all([
            prisma.networkCluster.findMany(),
            prisma.networkSplitter.findMany(),
            prisma.customer.findMany(),
            prisma.ticket.findMany(),
            prisma.role.findMany(),
            prisma.attenuationHistory.count({ where: { photoObjectKey: { not: '' } } }),
          ]);
        photosCount = photosCountResult;
        payloadData = {
          ...payloadData,
          counts: {
            clusters: clusters.length,
            splitters: splitters.length,
            customers: customers.length,
            tickets: tickets.length,
            roles: roles.length,
          },
          clusters,
          splitters,
          customers,
          tickets,
          roles,
        };
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal membaca tabel database untuk backup.');
      }
    }

    const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(payloadData), 'utf-8'));
    const sha256Checksum = crypto.createHash('sha256').update(compressedBuffer).digest('hex');
    const sizeMb = Number(Math.max(0.01, compressedBuffer.byteLength / (1024 * 1024)).toFixed(2));

    const uploadRes = await minioManager.putObjectBuffer(
      objectKey,
      compressedBuffer,
      'application/gzip',
    );

    const snapshot: BackupSnapshotItem = {
      id: `snap-${dateStr}`,
      timestamp: formatBackupTimestamp(now),
      filename,
      sizeMb,
      target: uploadRes.stored ? `MinIO (${objectKey})` : targetLabel,
      sha256Checksum,
      photosCount,
      status: 'SUCCESS',
    };

    if (dbReady) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const rec = await tx.backupRecord.create({
            data: {
              filename,
              sizeMb,
              target: snapshot.target,
              sha256Checksum,
              photosCount,
              status: 'SUCCESS',
              objectKey,
              createdBy: actor.userId,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'BACKUP_SNAPSHOT_TRIGGERED',
              targetEntity: 'backup',
              targetId: rec.id,
              newPayload: snapshot as unknown as Prisma.InputJsonValue,
            },
          });

          return rec;
        });
        snapshot.id = created.id;
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal mencatat riwayat backup ke PostgreSQL.');
      }
    }

    backupHistoryState.unshift(snapshot);
    if (backupHistoryState.length > 15) {
      backupHistoryState = backupHistoryState.slice(0, 15);
    }

    await redisManager.setPersistentKey(
      BACKUP_HISTORY_REDIS_KEY,
      JSON.stringify(backupHistoryState),
    );

    return snapshot;
  }
}
