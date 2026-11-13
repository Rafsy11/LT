import * as Minio from 'minio';
import { env } from '../../env';
import { isStrictLiveMode, ServiceUnavailableError } from './live-data';

const minioEndpoint = env.MINIO_ENDPOINT;
const minioPort = env.MINIO_PORT;
const minioUseSSL = env.MINIO_USE_SSL;
const minioAccessKey = env.MINIO_ACCESS_KEY;
const minioSecretKey = env.MINIO_SECRET_KEY;
export const PROOF_BUCKET_NAME = env.MINIO_BUCKET;

const MINIO_FAILURE_COOLDOWN_MS = 15_000;

class MinioStorageManager {
  private client: Minio.Client;
  private bucketChecked = false;
  private lastFailureAt = 0;

  constructor() {
    this.client = new Minio.Client({
      endPoint: minioEndpoint.replace(/^https?:\/\//, ''),
      port: minioPort,
      useSSL: minioUseSSL,
      accessKey: minioAccessKey,
      secretKey: minioSecretKey,
    });
  }

  private isInCooldown(): boolean {
    return this.lastFailureAt > 0 && Date.now() - this.lastFailureAt < MINIO_FAILURE_COOLDOWN_MS;
  }

  public async ensureBucket(): Promise<void> {
    if (this.bucketChecked || this.isInCooldown()) return;
    try {
      const exists = await this.client.bucketExists(PROOF_BUCKET_NAME);
      if (!exists) {
        await this.client.makeBucket(PROOF_BUCKET_NAME, 'us-east-1');
      }
      this.bucketChecked = true;
      this.lastFailureAt = 0;
    } catch (err) {
      this.lastFailureAt = Date.now();
      console.warn('[MinIO] Warning checking/creating bucket:', (err as Error).message);
    }
  }

  public async isHealthy(): Promise<boolean> {
    const scheme = minioUseSSL ? 'https' : 'http';
    try {
      const res = await fetch(`${scheme}://${minioEndpoint}:${minioPort}/minio/health/live`, {
        method: 'GET',
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        this.lastFailureAt = 0;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async getBucketUsageStats(): Promise<{ objectCount: number; totalBytes: number } | null> {
    try {
      await this.ensureBucket();
      if (this.isInCooldown()) return null;
      return await new Promise((resolve) => {
        let objectCount = 0;
        let totalBytes = 0;
        const stream = this.client.listObjectsV2(PROOF_BUCKET_NAME, '', true);
        const timer = setTimeout(() => {
          stream.destroy();
          resolve({ objectCount, totalBytes });
        }, 2000);

        stream.on('data', (obj) => {
          objectCount += 1;
          totalBytes += obj.size || 0;
        });
        stream.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
        stream.on('end', () => {
          clearTimeout(timer);
          resolve({ objectCount, totalBytes });
        });
      });
    } catch {
      return null;
    }
  }

  /**
   * Generates a Presigned PUT URL for technician mobile app to directly upload OPM proof photo.
   * Enforces Law 5: Files are stored in MinIO object storage, never in Next.js local storage.
   */
  public async generatePresignedPutUrl(objectKey: string, expirySeconds = 900): Promise<string> {
    await this.ensureBucket();
    if (this.isInCooldown()) {
      if (isStrictLiveMode()) {
        throw new ServiceUnavailableError('Layanan MinIO Object Storage sedang tidak dapat dihubungi.');
      }
      return `http://${minioEndpoint}:${minioPort}/${PROOF_BUCKET_NAME}/${objectKey}?mock_upload=true`;
    }
    try {
      return await this.client.presignedPutObject(PROOF_BUCKET_NAME, objectKey, expirySeconds);
    } catch (err) {
      this.lastFailureAt = Date.now();
      if (isStrictLiveMode()) {
        throw new ServiceUnavailableError('Gagal membuat presigned upload URL pada MinIO Storage.');
      }
      console.warn('[MinIO] Fallback presigned PUT url generation:', (err as Error).message);
      return `http://${minioEndpoint}:${minioPort}/${PROOF_BUCKET_NAME}/${objectKey}?mock_upload=true`;
    }
  }

  /**
   * Uploads raw file buffer directly into MinIO object storage (e.g. from web upload or Telegram bot media).
   */
  public async putObjectBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType = 'image/jpeg',
  ): Promise<{ stored: boolean; objectKey: string }> {
    await this.ensureBucket();
    if (this.isInCooldown()) {
      if (isStrictLiveMode()) {
        throw new ServiceUnavailableError('MinIO Storage tidak tersedia untuk menyimpan berkas.');
      }
      return { stored: false, objectKey };
    }
    try {
      await this.client.putObject(PROOF_BUCKET_NAME, objectKey, buffer, buffer.length, {
        'Content-Type': contentType,
      });
      return { stored: true, objectKey };
    } catch (err) {
      this.lastFailureAt = Date.now();
      if (isStrictLiveMode()) {
        throw new ServiceUnavailableError('Gagal mengunggah berkas ke MinIO Object Storage.');
      }
      console.warn('[MinIO] Warning uploading object buffer:', (err as Error).message);
      return { stored: false, objectKey };
    }
  }

  /**
   * Generates a Presigned GET URL for Web Admin to inspect photo evidence with temporary access.
   */
  public async generatePresignedGetUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    await this.ensureBucket();
    if (this.isInCooldown()) {
      return `http://${minioEndpoint}:${minioPort}/${PROOF_BUCKET_NAME}/${objectKey}`;
    }
    try {
      return await this.client.presignedGetObject(PROOF_BUCKET_NAME, objectKey, expirySeconds);
    } catch (err) {
      this.lastFailureAt = Date.now();
      console.warn('[MinIO] Fallback presigned GET url generation:', (err as Error).message);
      return `http://${minioEndpoint}:${minioPort}/${PROOF_BUCKET_NAME}/${objectKey}`;
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var minioStorageGlobal: MinioStorageManager | undefined;
}

export const minioManager = globalThis.minioStorageGlobal || new MinioStorageManager();

if (process.env.NODE_ENV !== 'production') {
  globalThis.minioStorageGlobal = minioManager;
}
