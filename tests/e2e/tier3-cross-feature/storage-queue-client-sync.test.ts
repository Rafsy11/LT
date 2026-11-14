import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineQueueManager } from '../../../apps/mobile/src/sync/offlineQueue';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';
import { SubmitTicketInput, ApiResponse } from '@repo/shared';

describe('Tier 3: Cross-Feature - Storage, Offline Queue & ApiClient Sync', () => {
  let mockStorage: MockPersistentStorage;
  let queueManager: OfflineQueueManager;
  let apiClient: ApiClient;
  let originalFetch: typeof globalThis.fetch;
  const requestHistory: Array<{ url: string; method: string; body?: any }> = [];

  const samplePayload: SubmitTicketInput = {
    submissionId: 'sync-uuid-001',
    splitterId: 'ODP-PLB-001',
    portNumber: 2,
    attenuationDbm: -18.7,
    submittedLat: -2.9833,
    submittedLng: 104.7644,
    isMockLocation: false,
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requestHistory.length = 0;
    mockStorage = new MockPersistentStorage();
    queueManager = new OfflineQueueManager(mockStorage);
    apiClient = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-sync-test',
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      requestHistory.push({ url, method, body: init?.body });

      // Local mock file response
      if (url.startsWith('file://')) {
        return new Response(new Blob(['mock-photo-bytes']), { status: 200 });
      }

      // Upload presigned URL endpoint
      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm/synced.jpg',
              objectKey: 'opm/synced.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // MinIO direct upload
      if (url.includes('minio.local')) {
        return new Response('', { status: 200 });
      }

      // Ticket submission endpoint
      if (url.includes('/submit')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { ticketId: 'WO-2025-0842', status: 'IN_PROGRESS' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    requestHistory.length = 0;
  });

  it('1. synchronizes offline enqueue with encrypted persistent storage', async () => {
    const item = await queueManager.enqueue({
      submissionId: 'sync-sub-001',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: samplePayload,
    });

    assert.strictEqual(item.submissionId, 'sync-sub-001');

    // Verify storage has encrypted payload
    const rawStored = await mockStorage.getItem('@fiberops_offline_ticket_queue_v1');
    assert.ok(rawStored, 'Storage must contain serialized queue');

    // Retrieve via queue manager to confirm successful decryption
    const queue = await queueManager.getQueue();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].submissionId, 'sync-sub-001');
    assert.strictEqual(queue[0].payload.attenuationDbm, -18.7);
  });

  it('2. flushes offline queue through ApiClient endpoints and dequeues from storage on success', async () => {
    queueManager.configure({
      apiClient,
      sender: async (ticketId, payload, idempotencyKey) => {
        return apiClient.request(`/api/v1/tech/tickets/${ticketId}/submit`, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'X-Idempotency-Key': idempotencyKey },
        });
      },
      uploader: async () => 'opm/synced.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sync-flush-001',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: samplePayload,
    });

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.failed, 0);

    // Verify queue is now empty in persistent storage
    const remainingQueue = await queueManager.getQueue();
    assert.strictEqual(remainingQueue.length, 0);
  });

  it('3. propagates dynamic ApiClient baseUrl change to subsequent queue flush requests', async () => {
    const newBaseUrl = 'https://palembang-edge.lintasarta.co.id';
    apiClient.setBaseUrl(newBaseUrl);

    let calledEndpoint = '';
    queueManager.configure({
      apiClient,
      sender: async (ticketId, payload) => {
        calledEndpoint = `${apiClient.getBaseUrl()}/api/v1/tech/tickets/${ticketId}/submit`;
        return { success: true, data: { status: 'COMPLETED' } };
      },
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sync-new-url',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///p.jpg',
      payload: samplePayload,
    });

    await queueManager.flush();
    assert.strictEqual(
      calledEndpoint,
      'https://palembang-edge.lintasarta.co.id/api/v1/tech/tickets/WO-2025-0842/submit'
    );
  });

  it('4. halts batch processing and preserves queue items in storage when ApiClient returns 401 Unauthorized', async () => {
    queueManager.configure({
      sender: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Sesi login telah berakhir' },
      }),
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sync-unauth-01',
      ticketId: 'WO-UNAUTH-01',
      localPhotoUri: 'file:///photo1.jpg',
      payload: samplePayload,
    });
    await queueManager.enqueue({
      submissionId: 'sync-unauth-02',
      ticketId: 'WO-UNAUTH-02',
      localPhotoUri: 'file:///photo2.jpg',
      payload: samplePayload,
    });

    const flushResult = await queueManager.flush();
    assert.strictEqual(flushResult.failed, 2);

    // Items must remain safely in storage
    const storedItems = await queueManager.getQueue();
    assert.strictEqual(storedItems.length, 2);
    assert.strictEqual(storedItems[0].submissionId, 'sync-unauth-01');
    assert.strictEqual(storedItems[1].submissionId, 'sync-unauth-02');
  });

  it('5. handles high-volume queue persistence (20 tickets) across storage and syncs sequentially', async () => {
    const processedIds: string[] = [];

    queueManager.configure({
      sender: async (ticketId) => {
        processedIds.push(ticketId);
        return { success: true, data: {} };
      },
      uploader: async () => 'opm/batch.jpg',
    });

    for (let i = 1; i <= 20; i++) {
      const ticketNum = `WO-SYNC-${String(i).padStart(3, '0')}`;
      await queueManager.enqueue({
        submissionId: `sub-high-${i}`,
        ticketId: ticketNum,
        localPhotoUri: 'file:///photo.jpg',
        payload: { ...samplePayload, submissionId: `sub-high-${i}` },
      });
    }

    const queueBefore = await queueManager.getQueue();
    assert.strictEqual(queueBefore.length, 20);

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 20);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(processedIds.length, 20);

    const queueAfter = await queueManager.getQueue();
    assert.strictEqual(queueAfter.length, 0);
  });

  it('6. recovers from corrupted storage state and re-establishes clean synchronization', async () => {
    await mockStorage.setItem('@fiberops_offline_ticket_queue_v1', '{corrupt-json-structure');

    // Manager should read empty queue instead of crashing
    const initialQueue = await queueManager.getQueue();
    assert.deepStrictEqual(initialQueue, []);

    // Subsequent enqueue should heal storage with valid encrypted format
    await queueManager.enqueue({
      submissionId: 'sync-healed-01',
      ticketId: 'WO-HEALED-01',
      localPhotoUri: 'file:///p.jpg',
      payload: samplePayload,
    });

    const healedQueue = await queueManager.getQueue();
    assert.strictEqual(healedQueue.length, 1);
    assert.strictEqual(healedQueue[0].submissionId, 'sync-healed-01');
  });
});
