import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { OfflineQueueManager } from '../../../apps/mobile/src/sync/offlineQueue';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { uploadOpmPhotoDualPath } from '../../../apps/mobile/src/camera/opmCamera';
import { SubmitTicketInput } from '@repo/shared';

describe('Tier 4: Workload Scenario - Intermittent Network Recovery & Failover', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: ApiClient;
  let mockStorage: MockPersistentStorage;
  let queueManager: OfflineQueueManager;
  let minioFails = true;
  let proxyFails = true; // Initially both fail to simulate full mid-flight drop
  const serverReceivedSubmissions: string[] = [];

  const basePayload: SubmitTicketInput = {
    submissionId: 'flapping-uuid-999',
    splitterId: 'ODP-PLB-015',
    portNumber: 3,
    attenuationDbm: -19.4,
    submittedLat: -2.9833,
    submittedLng: 104.7644,
    isMockLocation: false,
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    minioFails = true;
    proxyFails = true;
    serverReceivedSubmissions.length = 0;
    mockStorage = new MockPersistentStorage();
    queueManager = new OfflineQueueManager(mockStorage);

    client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-flapping-test',
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith('file://')) {
        return new Response(new Blob(['mock-photo']), { status: 200 });
      }

      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm/flapping.jpg',
              objectKey: 'opm/flapping.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('minio.local')) {
        if (minioFails) {
          return new Response('504 Gateway Timeout', { status: 504 });
        }
        return new Response('', { status: 200 });
      }

      if (url.includes('/api/v1/tech/tickets/') && url.includes('/upload')) {
        if (proxyFails) {
          throw new TypeError('Failed to fetch: Cellular tower socket abruptly closed');
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { photoObjectKey: 'proxy-uploads/flapping-recovered.jpg' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/submit')) {
        const body = JSON.parse(String(init?.body || '{}'));
        serverReceivedSubmissions.push(body.submissionId);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ticketId: 'WO-2025-0842',
              status: 'COMPLETED',
              alreadyProcessed: serverReceivedSubmissions.filter((id) => id === body.submissionId).length > 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    serverReceivedSubmissions.length = 0;
  });

  it('handles mid-upload drop across both MinIO and proxy, persists to offline queue, and recovers upon signal reconnection', async () => {
    const fixedSubmissionId = 'flapping-uuid-999';

    // -------------------------------------------------------------
    // Step 1: Attempt live upload while cell tower is degraded
    // -------------------------------------------------------------
    minioFails = true;
    proxyFails = true;

    let uploadFailed = false;
    try {
      await uploadOpmPhotoDualPath({
        apiClient: client,
        ticketId: 'WO-2025-0842',
        submissionId: fixedSubmissionId,
        localPhotoUri: 'file:///photo.jpg',
      });
    } catch {
      uploadFailed = true;
    }
    assert.strictEqual(uploadFailed, true, 'Live dual-path upload must fail when both paths are down');

    // -------------------------------------------------------------
    // Step 2: System safely intercepts failure and stores in offline queue
    // -------------------------------------------------------------
    await queueManager.enqueue({
      submissionId: fixedSubmissionId,
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: { ...basePayload, submissionId: fixedSubmissionId },
    });

    const queueCheck1 = await queueManager.getQueue();
    assert.strictEqual(queueCheck1.length, 1);
    assert.strictEqual(queueCheck1[0].submissionId, fixedSubmissionId);
    assert.strictEqual(queueCheck1[0].attempts, 0);

    // -------------------------------------------------------------
    // Step 3: First flush attempt while proxy is still down -> attempts increments to 1
    // -------------------------------------------------------------
    queueManager.configure({
      sender: async (ticketId, payload) => {
        return client.request(`/api/v1/tech/tickets/${ticketId}/submit`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      },
      uploader: async (localUri) => {
        const res = await uploadOpmPhotoDualPath({
          apiClient: client,
          ticketId: 'WO-2025-0842',
          submissionId: fixedSubmissionId,
          localPhotoUri: localUri,
        });
        return res.photoObjectKey;
      },
    });

    const flush1Result = await queueManager.flush();
    assert.strictEqual(flush1Result.failed, 1);
    assert.strictEqual(flush1Result.processed, 0);

    const queueCheck2 = await queueManager.getQueue();
    assert.strictEqual(queueCheck2.length, 1);
    assert.strictEqual(queueCheck2[0].attempts, 1);

    // -------------------------------------------------------------
    // Step 4: Network signal restores on Proxy path (e.g. Next.js gateway reachable)
    // -------------------------------------------------------------
    proxyFails = false; // Proxy recovery

    const flush2Result = await queueManager.flush();
    assert.strictEqual(flush2Result.processed, 1, 'Flush must succeed once network is recovered');
    assert.strictEqual(flush2Result.failed, 0);

    // -------------------------------------------------------------
    // Step 5: Verify clean final state and duplicate protection
    // -------------------------------------------------------------
    const finalQueue = await queueManager.getQueue();
    assert.strictEqual(finalQueue.length, 0, 'Queue must be empty after successful recovery');

    assert.strictEqual(serverReceivedSubmissions.length, 1);
    assert.strictEqual(serverReceivedSubmissions[0], fixedSubmissionId);
  });

  it('guarantees idempotency when an item is replayed after previous server commit (alreadyProcessed: true)', async () => {
    const replayId = 'replay-uuid-888';

    queueManager.configure({
      sender: async () => ({
        success: true,
        data: {
          ticketId: 'WO-2025-0842',
          status: 'COMPLETED',
          alreadyProcessed: true,
          message: 'Idempotency key previously recorded; replay safe',
        },
      }),
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: replayId,
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: { ...basePayload, submissionId: replayId },
    });

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.failed, 0);

    const queue = await queueManager.getQueue();
    assert.strictEqual(queue.length, 0, 'Replayed item must be cleanly removed from queue');
  });
});
