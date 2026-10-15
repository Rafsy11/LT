import { SubmitTicketInput, ApiResponse } from '@repo/shared';

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

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new InMemoryStorageAdapter();
  }

  public configure(sender: SubmissionSender, uploader?: PhotoUploader): void {
    this.sender = sender;
    this.uploader = uploader;
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
   */
  public async flush(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) return { processed: 0, failed: 0 };
    if (!this.sender) {
      console.warn('[OfflineQueue] Sender callback is not configured.');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    try {
      const queue = await this.getQueue();
      const successfullyProcessedIds = new Set<string>();

      for (const item of queue) {
        try {
          // 1. If photo hasn't been uploaded to MinIO yet, upload now
          if (this.uploader && !item.payload.photoObjectKey) {
            const objectKey = `proofs/${item.ticketId}_${item.submissionId}.jpg`;
            await this.uploader(item.localPhotoUri, objectKey);
            item.payload.photoObjectKey = objectKey;
          }

          // 2. Transmit to Next.js API using immutable idempotency key
          const res = await this.sender(item.ticketId, item.payload, item.submissionId);

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

      const remainingQueue = queue.filter((item) => !successfullyProcessedIds.has(item.submissionId));
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
  apiClient: {
    request: (
      endpoint: string,
      options: RequestInit,
      headers?: Record<string, string>
    ) => Promise<ApiResponse<unknown>>;
  }
): SubmissionSender {
  return async (ticketId: string, payload: SubmitTicketInput, idempotencyKey: string) => {
    return apiClient.request(
      `/api/v1/tech/tickets/${ticketId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      {
        'Idempotency-Key': idempotencyKey,
      }
    );
  };
}

export const offlineQueue = new OfflineQueueManager();

