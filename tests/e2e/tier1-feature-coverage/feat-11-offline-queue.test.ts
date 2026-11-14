import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineQueueManager, OfflineTicketSubmission } from '../../../apps/mobile/src/sync/offlineQueue';
import { MockPersistentStorage } from '../helpers/mock-storage';
import { SubmitTicketInput } from '@repo/shared';

describe('Tier 1: Feature 11 - Persistent Encrypted Offline Queue (apps/mobile/src/sync/offlineQueue.ts)', () => {
  let mockStorage: MockPersistentStorage;
  let queueManager: OfflineQueueManager;

  const samplePayload: SubmitTicketInput = {
    submissionId: 'test-sub-uuid-1234',
    splitterId: 'ODP-PLB-001',
    portNumber: 2,
    attenuationDbm: -18.5,
    submittedLat: -2.9833,
    submittedLng: 104.7644,
    isMockLocation: false,
  };

  beforeEach(() => {
    mockStorage = new MockPersistentStorage();
    queueManager = new OfflineQueueManager(mockStorage);
  });

  it('enqueues a pending submission and writes serialized data to persistent storage', async () => {
    const item = await queueManager.enqueue({
      submissionId: 'sub-field-001',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///data/user/0/opm-001.jpg',
      payload: samplePayload,
    });

    assert.ok(item.id.startsWith('queue_'));
    assert.strictEqual(item.submissionId, 'sub-field-001');
    assert.strictEqual(item.attempts, 0);

    const queued = await queueManager.getQueue();
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(queued[0].submissionId, 'sub-field-001');

    // Storage adapter raw store must contain the queue key
    const rawData = await mockStorage.getItem('@fiberops_offline_ticket_queue_v1');
    assert.ok(rawData, 'Storage must contain serialized queue');
  });

  it('guarantees technician original UUID v4 submissionId is preserved intact', async () => {
    const uniqueSubmissionId = 'a5e8f410-b472-4d56-a19e-9982736450ab';
    await queueManager.enqueue({
      submissionId: uniqueSubmissionId,
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: { ...samplePayload, submissionId: uniqueSubmissionId },
    });

    const items = await queueManager.getQueue();
    assert.strictEqual(items[0].submissionId, uniqueSubmissionId);
    assert.strictEqual(items[0].payload.submissionId, uniqueSubmissionId);
  });

  it('survives application re-initialization by restoring pending queue from persistent storage', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-crash-recover-01',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo1.jpg',
      payload: samplePayload,
    });
    await queueManager.enqueue({
      submissionId: 'sub-crash-recover-02',
      ticketId: 'WO-2025-0841',
      localPhotoUri: 'file:///photo2.jpg',
      payload: samplePayload,
    });

    // Simulate app restart by instantiating new manager with the same persistent storage
    const restoredManager = new OfflineQueueManager(mockStorage);
    const restoredItems = await restoredManager.getQueue();

    assert.strictEqual(restoredItems.length, 2);
    assert.strictEqual(restoredItems[0].submissionId, 'sub-crash-recover-01');
    assert.strictEqual(restoredItems[1].submissionId, 'sub-crash-recover-02');
  });

  it('dequeues successfully synced items by submissionId', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-done-01',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: samplePayload,
    });
    await queueManager.enqueue({
      submissionId: 'sub-pending-02',
      ticketId: 'WO-2025-0841',
      localPhotoUri: 'file:///photo.jpg',
      payload: samplePayload,
    });

    await queueManager.dequeue('sub-done-01');

    const remaining = await queueManager.getQueue();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].submissionId, 'sub-pending-02');
  });

  it('flushes queue and handles transmission retry counting when sender fails', async () => {
    await queueManager.enqueue({
      submissionId: 'sub-fail-retry-01',
      ticketId: 'WO-2025-0842',
      localPhotoUri: 'file:///photo.jpg',
      payload: samplePayload,
    });

    // Configure failing sender
    let attemptsCount = 0;
    queueManager.configure({
      sender: async () => {
        attemptsCount++;
        throw new Error('Jaringan seluler teknisi 3G terputus');
      },
      uploader: async () => 'proofs/mock_key.jpg',
    });

    const result = await queueManager.flush();
    assert.strictEqual(result.processed, 0);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(attemptsCount, 1);

    const queueAfterFail = await queueManager.getQueue();
    assert.strictEqual(queueAfterFail.length, 1);
    assert.strictEqual(queueAfterFail[0].attempts, 1);
    assert.match(queueAfterFail[0].lastError || '', /Jaringan seluler/i);

    // Now configure successful sender and re-flush
    queueManager.configure({
      sender: async () => ({ success: true, data: { ok: true } } as any),
      uploader: async () => 'proofs/mock_key.jpg',
    });

    const successResult = await queueManager.flush();
    assert.strictEqual(successResult.processed, 1);
    assert.strictEqual(successResult.failed, 0);

    const emptyQueue = await queueManager.getQueue();
    assert.strictEqual(emptyQueue.length, 0);
  });
});
