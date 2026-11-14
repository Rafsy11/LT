import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { OfflineQueueManager } from '../../../apps/mobile/src/sync/offlineQueue';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';
import {
  generateCanonicalPalembangOdps,
  TEST_TICKETS,
  createMockJpegBuffer,
} from '../helpers/test-fixtures';
import { compressOpmPhoto, uploadOpmPhotoDualPath } from '../../../apps/mobile/src/camera/opmCamera';
import { SubmitTicketInput } from '@repo/shared';

describe('Tier 4: Workload Scenario - Technician Full Offline Field Journey', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockStorage: MockPersistentStorage;
  let storageWrapper: EncryptedStorageWrapper;
  let queueManager: OfflineQueueManager;
  let apiClient: ApiClient;
  let isNetworkOnline = true;
  const serverSubmittedTickets: any[] = [];

  const STORAGE_KEY_ODPS = '@fiberops_cached_odps_v1';
  const STORAGE_KEY_TICKETS = '@fiberops_cached_tickets_v1';

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    isNetworkOnline = true;
    serverSubmittedTickets.length = 0;
    mockStorage = new MockPersistentStorage();
    storageWrapper = new EncryptedStorageWrapper(mockStorage);
    queueManager = new OfflineQueueManager(mockStorage);

    apiClient = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-technician-andi',
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (!isNetworkOnline && !url.startsWith('file://')) {
        throw new TypeError('Network request failed: Device is completely offline');
      }

      if (url.startsWith('file://')) {
        return new Response(new Blob(['mock-binary-opm']), { status: 200 });
      }

      if (url.includes('/api/v1/health')) {
        return new Response(JSON.stringify({ ok: true, status: 'HEALTHY' }), { status: 200 });
      }

      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm/wo-0842.jpg',
              objectKey: 'opm/wo-0842.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('minio.local')) {
        return new Response('', { status: 200 });
      }

      if (url.includes('/submit')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        serverSubmittedTickets.push(payload);
        return new Response(
          JSON.stringify({
            success: true,
            data: { ticketId: 'WO-2025-0842', status: 'COMPLETED' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    serverSubmittedTickets.length = 0;
  });

  it('executes full field technician journey: Depot Login -> 90 ODPs Cache -> Offline Dispatch -> Watermark Measurement -> Persistent Queue -> Return Online -> Auto Flush', async () => {
    // -------------------------------------------------------------
    // Phase 1: Technician logs in at depot and verifies server health
    // -------------------------------------------------------------
    const health = await apiClient.checkHealth();
    assert.strictEqual(health.ok, true, 'Server health check must succeed at depot');

    // -------------------------------------------------------------
    // Phase 2: Cache all 90 Palembang ODPs and assigned work orders
    // -------------------------------------------------------------
    const allOdps = generateCanonicalPalembangOdps();
    assert.strictEqual(allOdps.length, 90, 'Must have exactly 90 canonical Palembang ODPs');
    await storageWrapper.setEncryptedItem(STORAGE_KEY_ODPS, allOdps);

    const assignedTickets = [TEST_TICKETS.WO_0842, TEST_TICKETS.WO_0841];
    await storageWrapper.setEncryptedItem(STORAGE_KEY_TICKETS, assignedTickets);

    // Verify cache is safely encrypted on disk
    const rawOdps = await mockStorage.getItem(STORAGE_KEY_ODPS);
    assert.ok(rawOdps && !rawOdps.includes('ODP-PLB-090'), 'Cached ODPs must be stored encrypted');

    // -------------------------------------------------------------
    // Phase 3: Technician travels to field location; network goes offline
    // -------------------------------------------------------------
    isNetworkOnline = false;

    // Verify online calls fail as expected
    const offlineHealth = await apiClient.checkHealth();
    assert.strictEqual(offlineHealth.ok, false, 'Health check must report offline when disconnected');

    // -------------------------------------------------------------
    // Phase 4: App operates 100% offline from local encrypted cache
    // -------------------------------------------------------------
    const offlineCachedOdps = await storageWrapper.getEncryptedItem<typeof allOdps>(STORAGE_KEY_ODPS);
    assert.strictEqual(offlineCachedOdps?.length, 90);

    const offlineTickets = await storageWrapper.getEncryptedItem<typeof assignedTickets>(STORAGE_KEY_TICKETS);
    assert.strictEqual(offlineTickets?.length, 2);
    const activeTicket = offlineTickets![0];
    assert.strictEqual(activeTicket.ticketNumber, 'WO-2025-0842');

    // -------------------------------------------------------------
    // Phase 5: Field work at target ODP (ODP-PLB-001) & photo capture
    // -------------------------------------------------------------
    const measuredDbm = -18.6;
    const photoBuffer = createMockJpegBuffer(220 * 1024); // 220KB (<300KB)

    const compressedPhoto = await compressOpmPhoto(
      'file:///data/cache/raw_opm.jpg',
      { maxWidth: 1280, quality: 0.7 },
      async () => ({
        uri: 'file:///data/cache/watermarked_opm_final.jpg',
        width: 1280,
        height: 960,
        base64: photoBuffer.toString('base64'),
      })
    );
    assert.strictEqual(compressedPhoto.width, 1280);

    // -------------------------------------------------------------
    // Phase 6: Technician submits form; system detects offline and enqueues
    // -------------------------------------------------------------
    const submissionUuid = 'b45012a9-c891-4e78-9f12-0857312984ea';
    const submissionPayload: SubmitTicketInput = {
      submissionId: submissionUuid,
      splitterId: 'ODP-PLB-001',
      portNumber: 2,
      attenuationDbm: measuredDbm,
      submittedLat: -2.9833,
      submittedLng: 104.7644,
      isMockLocation: false,
    };

    const queuedItem = await queueManager.enqueue({
      submissionId: submissionUuid,
      ticketId: activeTicket.ticketNumber,
      localPhotoUri: compressedPhoto.uri,
      payload: submissionPayload,
    });

    assert.strictEqual(queuedItem.submissionId, submissionUuid);

    // Verify item is securely stored in persistent encrypted queue
    const queuedItems = await queueManager.getQueue();
    assert.strictEqual(queuedItems.length, 1);
    assert.strictEqual(queuedItems[0].submissionId, submissionUuid);
    assert.strictEqual(queuedItems[0].payload.attenuationDbm, -18.6);

    // -------------------------------------------------------------
    // Phase 7: Technician returns to depot/coverage area; network restores
    // -------------------------------------------------------------
    isNetworkOnline = true;
    const restoredHealth = await apiClient.checkHealth();
    assert.strictEqual(restoredHealth.ok, true, 'Network must be restored');

    // -------------------------------------------------------------
    // Phase 8: Auto-flush offline queue sequentially
    // -------------------------------------------------------------
    queueManager.configure({
      apiClient,
      sender: async (ticketId, payload, idempotencyKey) => {
        return apiClient.request(`/api/v1/tech/tickets/${ticketId}/submit`, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'X-Idempotency-Key': idempotencyKey },
        });
      },
      uploader: async (localUri) => {
        const uploadRes = await uploadOpmPhotoDualPath({
          apiClient,
          ticketId: activeTicket.ticketNumber,
          submissionId: submissionUuid,
          localPhotoUri: localUri,
        });
        return uploadRes.photoObjectKey;
      },
    });

    const flushResult = await queueManager.flush();
    assert.strictEqual(flushResult.processed, 1, 'Offline ticket must be flushed successfully');
    assert.strictEqual(flushResult.failed, 0);

    // -------------------------------------------------------------
    // Phase 9: Final verification of clean synced state
    // -------------------------------------------------------------
    const finalQueue = await queueManager.getQueue();
    assert.strictEqual(finalQueue.length, 0, 'Offline queue must be empty after successful flush');

    assert.strictEqual(serverSubmittedTickets.length, 1);
    assert.strictEqual(serverSubmittedTickets[0].submissionId, submissionUuid);
    assert.strictEqual(serverSubmittedTickets[0].attenuationDbm, -18.6);
  });

  it('validates offline flush attempt preserves queue item and records failure details when network is absent', async () => {
    isNetworkOnline = false;

    queueManager.configure({
      sender: async () => {
        throw new Error('No cellular connection available');
      },
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sub-no-net-01',
      ticketId: 'WO-OFFLINE-TEST',
      localPhotoUri: 'file:///photo.jpg',
      payload: {
        submissionId: 'sub-no-net-01',
        splitterId: 'ODP-PLB-001',
        portNumber: 1,
        attenuationDbm: -19.0,
        submittedLat: -2.9833,
        submittedLng: 104.7644,
        isMockLocation: false,
      },
    });

    const flushRes = await queueManager.flush();
    assert.strictEqual(flushRes.failed, 1);
    assert.strictEqual(flushRes.processed, 0);

    const queue = await queueManager.getQueue();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].attempts, 1);
    assert.ok(queue[0].lastError?.includes('No cellular connection'));
  });

  it('verifies cached 90 ODPs cover canonical Palembang clusters with valid metadata', async () => {
    const allOdps = generateCanonicalPalembangOdps();
    await storageWrapper.setEncryptedItem(STORAGE_KEY_ODPS, allOdps);

    const restoredOdps = await storageWrapper.getEncryptedItem<typeof allOdps>(STORAGE_KEY_ODPS);
    assert.strictEqual(restoredOdps?.length, 90);

    for (const odp of restoredOdps!) {
      assert.ok(odp.clusterCode && odp.clusterCode.length > 0, `ODP ${odp.id} missing clusterCode`);
      assert.ok(odp.clusterName && odp.clusterName.length > 0, `ODP ${odp.id} missing clusterName`);
      assert.ok(odp.latitude != null && odp.longitude != null, `ODP ${odp.id} missing coordinates`);
    }
  });
});
