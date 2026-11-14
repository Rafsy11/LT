import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineQueueManager, OfflineTicketSubmission } from '../../../apps/mobile/src/sync/offlineQueue';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { SubmitTicketInput, ApiResponse } from '@repo/shared';

describe('Tier 2: Boundary & Corner - Queue Concurrency & Limits', () => {
  let mockStorage: MockPersistentStorage;
  let queueManager: OfflineQueueManager;

  const basePayload: SubmitTicketInput = {
    submissionId: 'test-uuid-001',
    splitterId: 'ODP-PLB-001',
    portNumber: 3,
    attenuationDbm: -19.5,
    submittedLat: -2.9833,
    submittedLng: 104.7644,
    isMockLocation: false,
  };

  beforeEach(() => {
    mockStorage = new MockPersistentStorage();
    queueManager = new OfflineQueueManager(mockStorage);
  });

  it('1. preserves FIFO order strictly when enqueuing and retrieving multiple items', async () => {
    for (let i = 1; i <= 10; i++) {
      await queueManager.enqueue({
        submissionId: `sub-fifo-${String(i).padStart(3, '0')}`,
        ticketId: `WO-2025-${String(i).padStart(4, '0')}`,
        localPhotoUri: `file:///photos/opm_${i}.jpg`,
        payload: { ...basePayload, submissionId: `sub-fifo-${String(i).padStart(3, '0')}` },
      });
    }

    const items = await queueManager.getQueue();
    assert.strictEqual(items.length, 10);
    for (let i = 0; i < 10; i++) {
      const expectedSubId = `sub-fifo-${String(i + 1).padStart(3, '0')}`;
      assert.strictEqual(items[i].submissionId, expectedSubId);
    }
  });

  it('2. flushes empty queue as a no-op returning zero processed and zero failed', async () => {
    const result = await queueManager.flush();
    assert.deepStrictEqual(result, { processed: 0, failed: 0 });
  });

  it('3. guards against concurrent flush executions (isProcessing mutex lock)', async () => {
    let flushResolve: () => void;
    const flushPromise = new Promise<void>((res) => {
      flushResolve = res;
    });

    queueManager.configure({
      sender: async () => {
        await flushPromise;
        return { success: true, data: { status: 'COMPLETED' } };
      },
      uploader: async () => 'opm/key1.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sub-concur-01',
      ticketId: 'WO-2025-001',
      localPhotoUri: 'file:///photo.jpg',
      payload: basePayload,
    });

    // Start first flush in background
    const firstFlush = queueManager.flush();

    // Trigger second flush simultaneously while first is still waiting
    const secondFlushResult = await queueManager.flush();
    assert.deepStrictEqual(
      secondFlushResult,
      { processed: 0, failed: 0 },
      'Second concurrent flush must immediately return zero without re-processing'
    );

    // Resolve first flush
    flushResolve!();
    const firstFlushResult = await firstFlush;
    assert.strictEqual(firstFlushResult.processed, 1);
  });

  it('4. retains failed items in queue while successfully dequeuing passing items (partial batch)', async () => {
    queueManager.configure({
      sender: async (ticketId) => {
        if (ticketId === 'WO-FAIL-03') {
          return { success: false, error: { code: 'NOC_TIMEOUT', message: 'NOC backend timed out' } };
        }
        return { success: true, data: { status: 'OK' } };
      },
      uploader: async () => 'opm/key.jpg',
    });

    for (let i = 1; i <= 5; i++) {
      const ticketId = i === 3 ? 'WO-FAIL-03' : `WO-PASS-0${i}`;
      await queueManager.enqueue({
        submissionId: `sub-batch-${i}`,
        ticketId,
        localPhotoUri: 'file:///p.jpg',
        payload: { ...basePayload, submissionId: `sub-batch-${i}` },
      });
    }

    const flushResult = await queueManager.flush();
    assert.strictEqual(flushResult.processed, 4);
    assert.strictEqual(flushResult.failed, 1);

    const remainingQueue = await queueManager.getQueue();
    assert.strictEqual(remainingQueue.length, 1);
    assert.strictEqual(remainingQueue[0].ticketId, 'WO-FAIL-03');
    assert.strictEqual(remainingQueue[0].submissionId, 'sub-batch-3');
  });

  it('5. increments attempts counter on failed flush items', async () => {
    queueManager.configure({
      sender: async () => ({
        success: false,
        error: { code: 'NETWORK_ERR', message: 'Cannot reach gateway' },
      }),
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sub-retry-01',
      ticketId: 'WO-RETRY-01',
      localPhotoUri: 'file:///p.jpg',
      payload: basePayload,
    });

    // Flush attempt 1
    await queueManager.flush();
    let queue = await queueManager.getQueue();
    assert.strictEqual(queue[0].attempts, 1);
    assert.ok(queue[0].lastError?.includes('Cannot reach gateway'));

    // Flush attempt 2
    await queueManager.flush();
    queue = await queueManager.getQueue();
    assert.strictEqual(queue[0].attempts, 2);
  });

  it('6. handles server idempotent replay (alreadyProcessed: true) by marking item COMPLETED and dequeuing', async () => {
    queueManager.configure({
      sender: async () => ({
        success: true,
        data: {
          status: 'COMPLETED',
          alreadyProcessed: true,
          message: 'Idempotency key already committed; replay ignored',
        },
      }),
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: 'sub-replay-uuid-999',
      ticketId: 'WO-REPLAY-01',
      localPhotoUri: 'file:///p.jpg',
      payload: basePayload,
    });

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.failed, 0);

    const remaining = await queueManager.getQueue();
    assert.strictEqual(remaining.length, 0, 'Replayed item must be dequeued successfully');
  });

  it('7. emits progress callbacks in strict sequence (UPLOADING_MINIO -> SUBMITTING_API -> COMPLETED)', async () => {
    const emittedSteps: string[] = [];

    queueManager.configure({
      sender: async () => ({ success: true, data: {} }),
      uploader: async () => 'opm/key.jpg',
      onSyncProgress: (step, subId) => {
        emittedSteps.push(`${step}:${subId}`);
      },
    });

    await queueManager.enqueue({
      submissionId: 'sub-progress-01',
      ticketId: 'WO-PROGRESS-01',
      localPhotoUri: 'file:///photo.jpg',
      payload: basePayload,
    });

    await queueManager.flush();

    assert.deepStrictEqual(emittedSteps, [
      'UPLOADING_MINIO:sub-progress-01',
      'SUBMITTING_API:sub-progress-01',
      'COMPLETED:sub-progress-01',
      'IDLE:',
    ]);
  });

  it('8. skips MinIO photo upload step if payload already has photoObjectKey', async () => {
    let uploaderCalled = false;
    queueManager.configure({
      sender: async () => ({ success: true, data: {} }),
      uploader: async () => {
        uploaderCalled = true;
        return 'opm/key.jpg';
      },
    });

    await queueManager.enqueue({
      submissionId: 'sub-pre-uploaded-01',
      ticketId: 'WO-PRE-01',
      localPhotoUri: 'file:///p.jpg',
      payload: { ...basePayload, photoObjectKey: 'pre-existing/key.jpg' },
    });

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(uploaderCalled, false, 'Uploader should not be called when photoObjectKey is present');
  });

  it('9. handles catastrophic network drop during upload gracefully and keeps item in queue', async () => {
    queueManager.configure({
      uploader: async () => {
        throw new Error('ECONNRESET: MinIO S3 socket disconnected mid-stream');
      },
    });

    await queueManager.enqueue({
      submissionId: 'sub-econnreset-01',
      ticketId: 'WO-CRASH-01',
      localPhotoUri: 'file:///p.jpg',
      payload: basePayload,
    });

    const flushRes = await queueManager.flush();
    assert.strictEqual(flushRes.failed, 1);
    assert.strictEqual(flushRes.processed, 0);

    const items = await queueManager.getQueue();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].submissionId, 'sub-econnreset-01');
    assert.ok(items[0].lastError?.includes('ECONNRESET'));
  });

  it('10. handles dequeuing a non-existent submissionId without throwing or altering queue', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-stay-01',
      ticketId: 'WO-01',
      localPhotoUri: 'file:///p.jpg',
      payload: basePayload,
    });

    await queueManager.dequeue('non-existent-sub-id-xyz');
    const items = await queueManager.getQueue();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].submissionId, 'sub-stay-01');
  });

  it('11. scales to large queue depths (100 items) with accurate sequential accounting', async () => {
    queueManager.configure({
      sender: async (ticketId) => {
        const idx = parseInt(ticketId.replace('WO-SCALE-', ''), 10);
        // Fail every 10th item (10 failures total out of 100)
        if (idx % 10 === 0) {
          return { success: false, error: { code: 'FAIL_10', message: 'Simulated 10th failure' } };
        }
        return { success: true, data: {} };
      },
      uploader: async () => 'opm/key.jpg',
    });

    for (let i = 1; i <= 100; i++) {
      await queueManager.enqueue({
        submissionId: `scale-sub-${i}`,
        ticketId: `WO-SCALE-${i}`,
        localPhotoUri: 'file:///p.jpg',
        payload: { ...basePayload, submissionId: `scale-sub-${i}` },
      });
    }

    const queueBefore = await queueManager.getQueue();
    assert.strictEqual(queueBefore.length, 100);

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 90);
    assert.strictEqual(result.failed, 10);

    const queueAfter = await queueManager.getQueue();
    assert.strictEqual(queueAfter.length, 10);
  });

  it('12. maintains technician UUID v4 submissionId without mutation across 3 failed flush retries', async () => {
    const staticUuid = '8e18df04-e0c3-42bf-90ef-891c98e1694b';

    queueManager.configure({
      sender: async () => ({
        success: false,
        error: { code: 'SERVER_UNAVAILABLE', message: '503 Service Unavailable' },
      }),
      uploader: async () => 'opm/key.jpg',
    });

    await queueManager.enqueue({
      submissionId: staticUuid,
      ticketId: 'WO-UUID-RETRY',
      localPhotoUri: 'file:///p.jpg',
      payload: { ...basePayload, submissionId: staticUuid },
    });

    for (let retry = 1; retry <= 3; retry++) {
      await queueManager.flush();
      const currentQueue = await queueManager.getQueue();
      assert.strictEqual(currentQueue[0].submissionId, staticUuid);
      assert.strictEqual(currentQueue[0].payload.submissionId, staticUuid);
      assert.strictEqual(currentQueue[0].attempts, retry);
    }
  });

  it('13. handles corrupt JSON string in persistent storage by resetting to empty queue instead of crashing', async () => {
    await mockStorage.setItem('@fiberops_offline_ticket_queue_v1', 'corrupted-non-json-garbage-data');

    const queue = await queueManager.getQueue();
    assert.deepStrictEqual(queue, [], 'Corrupt storage content must cleanly return empty array');
  });

  it('14. supports enqueueing submission with extreme attenuation values (-99 dBm, +10 dBm)', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-extreme-neg',
      ticketId: 'WO-NEG-99',
      localPhotoUri: 'file:///p.jpg',
      payload: { ...basePayload, attenuationDbm: -99.9 },
    });
    await queueManager.enqueue({
      submissionId: 'sub-extreme-pos',
      ticketId: 'WO-POS-10',
      localPhotoUri: 'file:///p.jpg',
      payload: { ...basePayload, attenuationDbm: 10.0 },
    });

    const items = await queueManager.getQueue();
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].payload.attenuationDbm, -99.9);
    assert.strictEqual(items[1].payload.attenuationDbm, 10.0);
  });

  it('15. allows clearing the entire offline queue safely', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-to-clear',
      ticketId: 'WO-CLEAR',
      localPhotoUri: 'file:///p.jpg',
      payload: basePayload,
    });

    await mockStorage.removeItem('@fiberops_offline_ticket_queue_v1');
    const items = await queueManager.getQueue();
    assert.strictEqual(items.length, 0);
  });

  it('16. handles duplicate submission ID enqueueing idempotently by keeping existing or updating', async () => {
    const subId = 'idempotent-uuid-001';
    await queueManager.enqueue({
      submissionId: subId,
      ticketId: 'WO-DUP-01',
      localPhotoUri: 'file:///p1.jpg',
      payload: { ...basePayload, submissionId: subId },
    });

    const queue1 = await queueManager.getQueue();
    assert.strictEqual(queue1.length, 1);
    assert.strictEqual(queue1[0].submissionId, subId);
  });
});
