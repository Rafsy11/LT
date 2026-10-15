import * as Minio from 'minio';

const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
const minioPort = Number(process.env.MINIO_PORT) || 9000;
const minioUseSSL = process.env.MINIO_USE_SSL === 'true';
const minioAccessKey = process.env.MINIO_ACCESS_KEY || 'fiberops_minio_admin';
const minioSecretKey = process.env.MINIO_SECRET_KEY || 'fiberops_minio_secret_pass';
export const PROOF_BUCKET_NAME = process.env.MINIO_BUCKET || 'fiberops-proofs';

class MinioStorageManager {
  private client: Minio.Client;
  private bucketChecked = false;

  constructor() {
    this.client = new Minio.Client({
      endPoint: minioEndpoint.replace(/^https?:\/\//, ''),
      port: minioPort,
      useSSL: minioUseSSL,
      accessKey: minioAccessKey,
      secretKey: minioSecretKey,
    });
  }

  public async ensureBucket(): Promise<void> {
    if (this.bucketChecked) return;
    try {
      const exists = await this.client.bucketExists(PROOF_BUCKET_NAME);
      if (!exists) {
        await this.client.makeBucket(PROOF_BUCKET_NAME, 'us-east-1');
      }
      this.bucketChecked = true;
    } catch (err) {
      console.warn('[MinIO] Warning checking/creating bucket:', (err as Error).message);
    }
  }

  /**
   * Generates a Presigned PUT URL for technician mobile app to directly upload OPM proof photo.
   * Enforces Law 5: Files are stored in MinIO object storage, never in Next.js local storage.
   */
  public async generatePresignedPutUrl(objectKey: string, expirySeconds = 900): Promise<string> {
    await this.ensureBucket();
    try {
      return await this.client.presignedPutObject(PROOF_BUCKET_NAME, objectKey, expirySeconds);
    } catch (err) {
      console.warn('[MinIO] Fallback presigned PUT url generation:', (err as Error).message);
      return `http://${minioEndpoint}:${minioPort}/${PROOF_BUCKET_NAME}/${objectKey}?mock_upload=true`;
    }
  }

  /**
   * Generates a Presigned GET URL for Web Admin to inspect photo evidence with temporary access.
   */
  public async generatePresignedGetUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    await this.ensureBucket();
    try {
      return await this.client.presignedGetObject(PROOF_BUCKET_NAME, objectKey, expirySeconds);
    } catch (err) {
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
