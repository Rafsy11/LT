import { z } from 'zod';

export const SystemSettingsSchema = z.object({
  // Workspace & ISP Profile
  companyName: z.string().min(2, 'Nama perusahaan wajib diisi'),
  serverTimezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']),
  publicAccessMethod: z.enum(['STATIC_IP_HTTPS', 'CLOUDFLARE_TUNNEL', 'INTERNAL_VPN']),
  publicDomain: z.string().min(3, 'Format domain publik tidak valid'),

  // PRD 3.3 & PRD 8 Item 3: Field & Geofencing
  geofenceRadiusMeters: z.number().int().min(10).max(1000),
  locationViolationPolicy: z.enum(['SOFT_WARNING', 'HARD_BLOCK']),
  blockMockLocation: z.boolean(),
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Format versi semver x.y.z wajib valid'),

  // PRD 7.1 & PRD 8 Item 1: Hardware & Local AI Inference
  aiInferenceMode: z.enum(['GPU_ACCELERATED', 'CPU_FALLBACK']),
  selectedAiModel: z.string(),
  maxConcurrentAiQueries: z.number().int().min(1).max(4),
  aiMemoryLimitGb: z.number().int().min(4).max(64),

  // PRD 7.3 & PRD 8 Item 4: Disaster Recovery 3-2-1
  cronSchedule: z.string(),
  compressionEncrypted: z.boolean(),
  secondaryBackupTarget: z.enum(['EXTERNAL_NAS', 'ENCRYPTED_CLOUD_BUCKET', 'OFFLINE_COLD_STORAGE']),
  secondaryStoragePath: z.string().min(3, 'Path penyimpanan cadangan wajib diisi'),

  // PRD 7.3: Distribusi Mobile & Self-Hosted OTA Update
  apkDownloadUrl: z.string().optional(),
  otaUpdateUrl: z.string().optional(),
});

export type SystemSettingsInput = z.infer<typeof SystemSettingsSchema>;

export interface ContainerHealth {
  name: string;
  service: 'postgres' | 'nextjs-app' | 'redis' | 'minio' | 'ollama-ai' | 'nginx';
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  details: string;
}

export interface BackupSnapshotItem {
  id: string;
  timestamp: string;
  filename: string;
  sizeMb: number;
  target: string;
  sha256Checksum: string;
  photosCount: number;
  status: 'SUCCESS' | 'IN_PROGRESS' | 'FAILED';
}

export interface SystemTelemetryData {
  cpuCores: number;
  cpuModel: string;
  cpuUsage: number;
  ramTotalGb: number;
  ramUsedGb: number;
  storageTotalGb: number;
  storageUsedGb: number;
  gpuModel?: string;
  gpuVramTotalGb?: number;
  gpuVramUsedGb?: number;
  containers: ContainerHealth[];
  backupHistory: BackupSnapshotItem[];
}
