import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PersistentStorageAdapter,
  persistentStorage,
  getEncryptedItem,
  setEncryptedItem,
  removeEncryptedItem,
} from '../../../apps/mobile/src/storage/persistentStorage';
import { decryptData } from '../../../apps/mobile/src/security/deviceIntegrity';

describe('Tier 1: Feature 9 - Universal Persistent Storage (apps/mobile/src/storage/persistentStorage.ts)', () => {
  beforeEach(async () => {
    await persistentStorage.clear();
  });

  it('stores and retrieves plain string values via storage adapter contract', async () => {
    await persistentStorage.setItem('test_key', 'test_value_fiberops');
    const retrieved = await persistentStorage.getItem('test_key');
    assert.strictEqual(retrieved, 'test_value_fiberops');

    const nonExistent = await persistentStorage.getItem('unknown_key_xyz');
    assert.strictEqual(nonExistent, null);
  });

  it('serializes, encrypts, and restores structured objects via setEncryptedItem / getEncryptedItem', async () => {
    const complexTicket = {
      ticketNumber: 'WO-2025-0842',
      customerName: 'PT Sriwijaya Mandiri',
      currentAttenuation: -19.5,
      splitterId: 'ODP-PLB-001',
      coordinates: { lat: -2.9833, lon: 104.7644 },
    };

    await setEncryptedItem('cached_ticket_0842', complexTicket);
    const restored = await getEncryptedItem<typeof complexTicket>('cached_ticket_0842');

    assert.notStrictEqual(restored, null);
    assert.strictEqual(restored?.ticketNumber, 'WO-2025-0842');
    assert.strictEqual(restored?.customerName, 'PT Sriwijaya Mandiri');
    assert.strictEqual(restored?.currentAttenuation, -19.5);
    assert.strictEqual(restored?.coordinates.lat, -2.9833);
  });

  it('verifies XOR cipher protects payload so raw stored data is not plaintext JSON', async () => {
    const sensitivePayload = { token: 'super_secret_jwt_field_worker_key_2026' };
    await setEncryptedItem('auth_token', sensitivePayload);

    const rawStored = await persistentStorage.getItem('auth_token');

    assert.ok(rawStored, 'Raw stored item must exist');
    assert.strictEqual(
      rawStored.includes('super_secret_jwt'),
      false,
      'Stored data must NOT contain plaintext sensitive credentials'
    );
    // Decrypting raw stored returns the original JSON
    const decryptedJson = await decryptData(rawStored);
    assert.ok(decryptedJson.includes('super_secret_jwt'));
  });

  it('safely handles tampered or corrupted ciphertext without throwing fatal exceptions', async () => {
    // Write corrupted data
    await persistentStorage.setItem('corrupted_key', '!!!NOT_VALID_CIPHERTEXT!!!');

    const result = await getEncryptedItem('corrupted_key');
    assert.strictEqual(
      result,
      null,
      'Corrupted ciphertext must gracefully yield null instead of throwing an unhandled error'
    );
  });

  it('removes encrypted keys properly and clears stored items', async () => {
    await setEncryptedItem('session_1', { active: true });
    await setEncryptedItem('session_2', { active: false });

    await removeEncryptedItem('session_1');
    const readSession1 = await getEncryptedItem('session_1');
    assert.strictEqual(readSession1, null);

    const readSession2 = await getEncryptedItem('session_2');
    assert.notStrictEqual(readSession2, null);

    await persistentStorage.clear();
    const readAfterClear = await getEncryptedItem('session_2');
    assert.strictEqual(readAfterClear, null);
  });

  it('preserves empty string values without corrupting to null in PersistentStorageAdapter', async () => {
    const adapter = new PersistentStorageAdapter();
    await adapter.setItem('empty_test_key', '');
    const retrieved = await adapter.getItem('empty_test_key');
    assert.strictEqual(retrieved, '', 'Empty string should be preserved as "", not converted to null');
  });

  it('retrieves degraded write data from inMemoryFallback and cleans it on removeItem', async () => {
    const adapter = new PersistentStorageAdapter();
    (adapter as any).inMemoryFallback.set('fallback_key', 'fallback_data');
    const retrieved = await adapter.getItem('fallback_key');
    assert.strictEqual(retrieved, 'fallback_data', 'Should retrieve fallback data from inMemoryFallback');

    await adapter.removeItem('fallback_key');
    const afterRemove = await adapter.getItem('fallback_key');
    assert.strictEqual(afterRemove, null, 'Should remove fallback data on removeItem');
  });
});
