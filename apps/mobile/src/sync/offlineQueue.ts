import { SubmitTicketInput, ApiResponse } from '@repo/shared';
import { uploadToPresignedPutUrl } from '../camera/opmCamera';

export interface OfflineTicketSubmission {
  id: string;
  submissionId: string; // Law 3: UUID v4 Idempotency Key MUST remain intact across retries
  ticketId: string;
  localPhotoUri: string;
  photoObjectKey?: string;
  payload: SubmitTicketInput;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export type SubmissionSender = (
  ticketId: string,
  payload: SubmitTicketInput,
  idempotencyKey: string
) => Promise<ApiResponse<unknown>>;

export type PhotoUploader = (localUri: string, objectKey: string) => Promise<string>;

export interface MobileApiClientLike {
  request: <T = unknown>(
    endpoint: string,
    options?: RequestInit,
    customHeaders?: Record<string, string>
  ) => Promise<ApiResponse<T>>;
}

/**
 * Interface for pluggable mobile storage (MMKV, expo-sqlite, or AsyncStorage).
 */
export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

class InMemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export class OfflineQueueManager {
  private static STORAGE_KEY = '@fiberops_offline_ticket_queue_v1';
  private storage: StorageAdapter;
  private isProcessing = false;
  private sender?: SubmissionSender;
  private uploader?: PhotoUploader;
  private apiClient?: MobileApiClientLike;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new InMemoryStorageAdapter();
  }

  public configure(config: {
    apiClient?: MobileApiClientLike;
    sender?: SubmissionSender;
    uploader?: PhotoUploader;
  }): void {
    if (config.apiClient) this.apiClient = config.apiClient;
    if (config.sender) this.sender = config.sender;
    if (config.uploader) this.uploader = config.uploader;
  }

  /**
   * Retrieves all pending submissions currently in the offline queue.
   */
  public async getQueue(): Promise<OfflineTicketSubmission[]> {
    try {
      const raw = await this.storage.getItem(OfflineQueueManager.STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as OfflineTicketSubmission[];
    } catch {
      return [];
    }
  }

  /**
   * Persists queue back to local disk (MMKV/SQLite).
   */
  private async saveQueue(queue: OfflineTicketSubmission[]): Promise<void> {
    await this.storage.setItem(OfflineQueueManager.STORAGE_KEY, JSON.stringify(queue));
  }

  /**
   * Enqueues a ticket submission when network connectivity is lost.
   * Law 3: Intentionally preserves the technician's original UUID v4 submission_id.
   */
  public async enqueue(
    submission: Omit<OfflineTicketSubmission, 'id' | 'createdAt' | 'attempts'>
  ): Promise<OfflineTicketSubmission> {
    const queue = await this.getQueue();

    const newItem: OfflineTicketSubmission = {
      ...submission,
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    queue.push(newItem);
    await this.saveQueue(queue);
    return newItem;
  }

  /**
   * Removes successfully processed submission from queue.
   */
  public async dequeue(submissionId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.submissionId !== submissionId);
    await this.saveQueue(filtered);
  }

  /**
   * Flushes offline submissions sequentially when NetInfo detects active internet.
   * 1. If photo hasn't been uploaded, requests Presigned PUT URL from /api/v1/tech/upload-url
   * 2. Uploads binary directly to MinIO via Presigned URL
   * 3. Sends ticket submission to POST /api/v1/tech/tickets/[id]/submit with X-Idempotency-Key
   */
  public async flush(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) return { processed: 0, failed: 0 };

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    try {
      const queue = await this.getQueue();
      const successfullyProcessedIds = new Set<string>();

      for (const item of queue) {
        try {
          // 1. Photo Upload to MinIO (Presigned URL)
          if (item.localPhotoUri && !item.payload.photoObjectKey) {
            let uploadedKey: string | null = null;

            if (this.apiClient) {
              // Request Presigned PUT URL from Next.js server
              const urlRes = await this.apiClient.request<{
                uploadUrl: string;
                objectKey: string;
              }>('/api/v1/tech/upload-url', {
                method: 'POST',
                body: JSON.stringify({
                  ticketId: item.ticketId,
                  submissionId: item.submissionId,
                }),
              });

              if (!urlRes.success) {
                throw new Error(
                  urlRes.error?.message || 'Gagal meminta Presigned PUT URL dari server'
                );
              }

              if (!urlRes.data?.uploadUrl) {
                throw new Error('Presigned upload URL tidak ditemukan dalam respon server');
              }

              const { uploadUrl, objectKey } = urlRes.data;

              // Upload photo binary directly to MinIO
              const ok = await uploadToPresignedPutUrl(uploadUrl, item.localPhotoUri);
              if (!ok) {
                throw new Error('Gagal mengunggah foto bukti ke MinIO Object Storage');
              }

              uploadedKey = objectKey;
            } else if (this.uploader) {
              const defaultKey = `proofs/${item.ticketId}_${item.submissionId}.jpg`;
              uploadedKey = await this.uploader(item.localPhotoUri, defaultKey);
            }

            if (uploadedKey) {
              item.payload.photoObjectKey = uploadedKey;
              item.photoObjectKey = uploadedKey;
            }
          }

          // 2. Transmit ticket submission to API with immutable UUID v4 Idempotency Key
          let res: ApiResponse<unknown>;

          if (this.sender) {
            res = await this.sender(item.ticketId, item.payload, item.submissionId);
          } else if (this.apiClient) {
            res = await this.apiClient.request<unknown>(
              `/api/v1/tech/tickets/${item.ticketId}/submit`,
              {
                method: 'POST',
                body: JSON.stringify(item.payload),
              },
              {
                'X-Idempotency-Key': item.submissionId,
                'Idempotency-Key': item.submissionId,
              }
            );
          } else {
            console.warn('[OfflineQueue] Neither sender nor apiClient configured.');
            break;
          }

          if (res.success || ('meta' in res && Boolean((res as any).meta?.alreadyProcessed))) {
            successfullyProcessedIds.add(item.submissionId);
            processed++;
          } else {
            item.attempts += 1;
            item.lastError = res.error?.message || 'Pengiriman gagal';
            failed++;
          }
        } catch (itemErr) {
          item.attempts += 1;
          item.lastError = (itemErr as Error).message;
          failed++;
        }
      }

      const remainingQueue = queue.filter(
        (item) => !successfullyProcessedIds.has(item.submissionId)
      );
      await this.saveQueue(remainingQueue);
    } finally {
      this.isProcessing = false;
    }

    return { processed, failed };
  }

  /**
   * Subscribes to NetInfo network connectivity transitions and triggers flush upon reconnection.
   */
  public attachNetInfoListener(
    subscribeNetInfo: (callback: (state: { isConnected: boolean | null }) => void) => () => void
  ): () => void {
    let wasConnected = true;

    return subscribeNetInfo((state) => {
      const isOnline = Boolean(state.isConnected);
      if (isOnline && !wasConnected) {
        // Connection restored: automatically flush offline queue
        console.log('[OfflineQueue] Connection restored. Flushing pending queue...');
        void this.flush();
      }
      wasConnected = isOnline;
    });
  }
}

/**
 * Creates default HTTP submission sender utilizing ApiClient and targeting:
 * POST /api/v1/tech/tickets/[id]/submit
 */
export function createDefaultSubmissionSender(
  apiClient: MobileApiClientLike
): SubmissionSender {
  return async (ticketId: string, payload: SubmitTicketInput, idempotencyKey: string) => {
    return apiClient.request(
      `/api/v1/tech/tickets/${ticketId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      {
        'X-Idempotency-Key': idempotencyKey,
        'Idempotency-Key': idempotencyKey,
      }
    );
  };
}

export const offlineQueue = new OfflineQueueManager();
