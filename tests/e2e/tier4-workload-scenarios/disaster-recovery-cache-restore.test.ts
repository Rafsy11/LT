import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineQueueManager } from '../../../apps/mobile/src/sync/offlineQueue';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';
import { generateCanonicalPalembangOdps, TEST_TICKETS } from '../helpers/test-fixtures';

const SERVER_URL_KEY = '@fiberops_server_url_v1';
const AUTH_TOKEN_KEY = '@fiberops_auth_tokens_v1';
const CACHED_ODPS_KEY = '@fiberops_cached_odps_v1';

describe('Tier 4: Workload Scenario - Disaster Recovery & Cache State Restoration', () => {
  it('survives simulated fatal application crash: Persists State -> Simulates Process Kill -> Fresh App Bootstrap -> Restores Tokens, 90 ODPs & Queue -> Successful Flush', async () => {
    // -------------------------------------------------------------
    // Phase 1: Setup pre-crash state on simulated persistent disk
    // -------------------------------------------------------------
    const diskStorage = new MockPersistentStorage();
    const diskWrapper = new EncryptedStorageWrapper(diskStorage);

    // 1. Persist Server URL
    await diskStorage.setItem(SERVER_URL_KEY, 'https://ftth-edge.lintasarta.co.id');

    // 2. Persist Auth Tokens
    const activeTokens = {
      accessToken: 'jwt_valid_access_token_field_01',
      refreshToken: 'jwt_valid_refresh_token_field_01',
      expiresAt: Date.now() + 3600 * 1000,
    };
    await diskWrapper.setEncryptedItem(AUTH_TOKEN_KEY, activeTokens);

    // 3. Persist 90 Palembang ODPs
    const canonicalOdps = generateCanonicalPalembangOdps();
    assert.strictEqual(canonicalOdps.length, 90);
    await diskWrapper.setEncryptedItem(CACHED_ODPS_KEY, canonicalOdps);

    // 4. Enqueue 3 pending field work orders into persistent offline queue
    const preCrashQueue = new OfflineQueueManager(diskStorage);
    const subIds = [
      'crash-sub-uuid-001',
      'crash-sub-uuid-002',
      'crash-sub-uuid-003',
    ];

    for (let i = 0; i < 3; i++) {
      await preCrashQueue.enqueue({
        submissionId: subIds[i],
        ticketId: `WO-2025-084${i + 1}`,
        localPhotoUri: `file:///photos/opm_${i + 1}.jpg`,
        payload: {
          submissionId: subIds[i],
          splitterId: `ODP-PLB-00${i + 1}`,
          portNumber: i + 1,
          attenuationDbm: -18.5 - i * 0.4,
          submittedLat: -2.9833,
          submittedLng: 104.7644,
          isMockLocation: false,
        },
      });
    }

    const preCrashItems = await preCrashQueue.getQueue();
    assert.strictEqual(preCrashItems.length, 3);

    // -------------------------------------------------------------
    // Phase 2: Simulate OS Process Kill (Garbage collection of all runtime instances)
    // -------------------------------------------------------------
    // Nullify all in-memory references to simulate process memory wipe
    let deadQueue: any = preCrashQueue;
    deadQueue = null;
    assert.strictEqual(deadQueue, null);

    // -------------------------------------------------------------
    // Phase 3: Fresh App Bootstrap (Brand new instances, reading only persistent disk)
    // -------------------------------------------------------------
    const bootstrappedWrapper = new EncryptedStorageWrapper(diskStorage);
    const bootstrappedQueue = new OfflineQueueManager(diskStorage);

    // Verify 1: Restored Server URL
    const restoredServerUrl = await diskStorage.getItem(SERVER_URL_KEY);
    assert.strictEqual(restoredServerUrl, 'https://ftth-edge.lintasarta.co.id');

    // Verify 2: Restored Auth Session Tokens
    const restoredTokens = await bootstrappedWrapper.getEncryptedItem<typeof activeTokens>(AUTH_TOKEN_KEY);
    assert.notStrictEqual(restoredTokens, null);
    assert.strictEqual(restoredTokens?.accessToken, activeTokens.accessToken);

    // Verify 3: Restored 90 Palembang ODPs
    const restoredOdps = await bootstrappedWrapper.getEncryptedItem<typeof canonicalOdps>(CACHED_ODPS_KEY);
    assert.strictEqual(restoredOdps?.length, 90, 'All 90 ODPs must be restored from disk without data loss');
    assert.strictEqual(restoredOdps![0].id, 'ODP-PLB-001');
    assert.strictEqual(restoredOdps![89].id, 'ODP-PLB-090');

    // Verify 4: Restored Offline Queue with intact UUID v4 IDs
    const restoredQueueItems = await bootstrappedQueue.getQueue();
    assert.strictEqual(restoredQueueItems.length, 3, 'All 3 queued submissions must survive process crash');

    for (let i = 0; i < 3; i++) {
      assert.strictEqual(restoredQueueItems[i].submissionId, subIds[i]);
      assert.strictEqual(restoredQueueItems[i].ticketId, `WO-2025-084${i + 1}`);
      assert.strictEqual(restoredQueueItems[i].payload.attenuationDbm, -18.5 - i * 0.4);
    }

    // -------------------------------------------------------------
    // Phase 4: Resume operations and flush recovered queue
    // -------------------------------------------------------------
    const flushedIds: string[] = [];
    bootstrappedQueue.configure({
      sender: async (ticketId, payload, subId) => {
        flushedIds.push(subId);
        return { success: true, data: { status: 'COMPLETED' } };
      },
      uploader: async () => 'opm/restored.jpg',
    });

    const flushResult = await bootstrappedQueue.flush();
    assert.strictEqual(flushResult.processed, 3, 'All 3 recovered items must flush successfully');
    assert.strictEqual(flushResult.failed, 0);
    assert.deepStrictEqual(flushedIds, subIds);

    const emptyQueue = await bootstrappedQueue.getQueue();
    assert.strictEqual(emptyQueue.length, 0, 'Offline queue must be cleared on disk');
  });

  it('guarantees key-level fault isolation: corruption of one cache key does not damage adjacent keys', async () => {
    const storage = new MockPersistentStorage();
    const wrapper = new EncryptedStorageWrapper(storage);

    // Save good keys
    await wrapper.setEncryptedItem('user_profile', { id: 'usr-01', role: 'TECHNICIAN' });
    await wrapper.setEncryptedItem('odp_list', [{ id: 'ODP-PLB-001' }]);

    // Corrupt one key directly in storage
    await storage.setItem('corrupted_draft', '!!!RAW_CORRUPTED_CIPHERTEXT!!!');

    // Verify good keys read cleanly despite adjacent corruption
    const user = await wrapper.getEncryptedItem<{ id: string }>('user_profile');
    assert.strictEqual(user?.id, 'usr-01');

    const odps = await wrapper.getEncryptedItem<any[]>('odp_list');
    assert.strictEqual(odps?.length, 1);

    // Corrupted key yields null safely
    const corrupted = await wrapper.getEncryptedItem('corrupted_draft');
    assert.strictEqual(corrupted, null);
  });
});
