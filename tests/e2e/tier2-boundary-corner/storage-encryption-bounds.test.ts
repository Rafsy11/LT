import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MockPersistentStorage,
  EncryptedStorageWrapper,
  xorEncrypt,
  xorDecrypt,
} from '../helpers/mock-storage';

describe('Tier 2: Boundary & Corner - Storage & Encryption Bounds', () => {
  let mockStorage: MockPersistentStorage;
  let wrapper: EncryptedStorageWrapper;

  beforeEach(() => {
    mockStorage = new MockPersistentStorage();
    wrapper = new EncryptedStorageWrapper(mockStorage);
  });

  it('1. returns null safely when ciphertext is completely random noise', async () => {
    await mockStorage.setItem('key_noise', 'random_garbage_not_encrypted_data_xyz_123');
    const result = await wrapper.getEncryptedItem('key_noise');
    assert.strictEqual(result, null, 'Random noise must resolve to null without uncaught exception');
  });

  it('2. handles malformed non-base64 characters in storage ciphertext', async () => {
    await mockStorage.setItem('key_malformed', '@@@$$$%%%^^^&&&***(((');
    const result = await wrapper.getEncryptedItem('key_malformed');
    assert.strictEqual(result, null, 'Invalid base64 characters must return null');
  });

  it('3. handles truncated ciphertext gracefully without throwing syntax error', async () => {
    const original = { id: 'TKT-001', payload: 'valid long payload' };
    const rawCipher = xorEncrypt(JSON.stringify(original));
    const truncated = rawCipher.substring(0, Math.floor(rawCipher.length / 2));

    await mockStorage.setItem('key_truncated', truncated);
    const result = await wrapper.getEncryptedItem('key_truncated');
    assert.strictEqual(result, null, 'Truncated ciphertext must safely yield null');
  });

  it('4. handles mismatched encryption keys and fails cleanly to null', async () => {
    const secretKeyA = 'KEY_ALPHA_SECRET_1';
    const secretKeyB = 'KEY_BETA_SECRET_2';

    const wrapperA = new EncryptedStorageWrapper(mockStorage, secretKeyA);
    const wrapperB = new EncryptedStorageWrapper(mockStorage, secretKeyB);

    await wrapperA.setEncryptedItem('shared_slot', { secret: 'top_confidential' });
    const decryptedWithWrongKey = await wrapperB.getEncryptedItem('shared_slot');

    assert.strictEqual(
      decryptedWithWrongKey,
      null,
      'Decrypting with mismatched key must not return corrupted object'
    );
  });

  it('5. handles empty string key gracefully', async () => {
    await wrapper.setEncryptedItem('', { target: 'empty_key' });
    const retrieved = await wrapper.getEncryptedItem<{ target: string }>('');
    assert.deepStrictEqual(retrieved, { target: 'empty_key' });
  });

  it('6. handles whitespace-only keys without stripping or crashing', async () => {
    const whitespaceKey = '   \t  \n ';
    await wrapper.setEncryptedItem(whitespaceKey, { test: 'whitespace' });
    const retrieved = await wrapper.getEncryptedItem<{ test: string }>(whitespaceKey);
    assert.deepStrictEqual(retrieved, { test: 'whitespace' });
  });

  it('7. round-trips Indonesian multilingual payloads with diacritics and special punctuation', async () => {
    const payload = {
      lokasi: 'ODP-PLB-008 — Seberang Ulu I, Palembang',
      catatanTeknisi: 'Penyambungan ulang pigtail dropcore; redaman stabil di -19.4 dBm.',
      slaStatus: 'Memenuhi standar SLA (< 4 jam)',
    };

    await wrapper.setEncryptedItem('indo_payload', payload);
    const retrieved = await wrapper.getEncryptedItem<typeof payload>('indo_payload');
    assert.deepStrictEqual(retrieved, payload);
  });

  it('8. round-trips non-Latin multibyte unicode (Arabic, CJK, Thai)', async () => {
    const unicodeData = {
      arabic: 'شركة الاتصالات باليمبانج',
      cjk: '巨港光纤网络测试 -18.5dBm',
      thai: 'การทดสอบใยแก้วนำแสง',
    };

    await wrapper.setEncryptedItem('unicode_multibyte', unicodeData);
    const result = await wrapper.getEncryptedItem<typeof unicodeData>('unicode_multibyte');
    assert.deepStrictEqual(result, unicodeData);
  });

  it('9. preserves emojis, surrogate pairs, and technical symbols in encrypted payloads', async () => {
    const emojiPayload = {
      statusBadge: '🟢 BAIK (-18.2 dBm) 📡⚡️🚀',
      photos: ['📸 file:///camera/opm_01.jpg', '🏷️ ODP-PLB-015'],
      technicianReaction: '👍 verified & calibrated ✅',
    };

    await wrapper.setEncryptedItem('emoji_key', emojiPayload);
    const retrieved = await wrapper.getEncryptedItem<typeof emojiPayload>('emoji_key');
    assert.deepStrictEqual(retrieved, emojiPayload);
  });

  it('10. handles empty string values without JSON parse errors', async () => {
    await wrapper.setEncryptedItem('empty_str', '');
    const result = await wrapper.getEncryptedItem<string>('empty_str');
    assert.strictEqual(result, '');
  });

  it('11. round-trips empty object and empty array root payloads', async () => {
    await wrapper.setEncryptedItem('empty_obj', {});
    await wrapper.setEncryptedItem('empty_arr', []);

    assert.deepStrictEqual(await wrapper.getEncryptedItem('empty_obj'), {});
    assert.deepStrictEqual(await wrapper.getEncryptedItem('empty_arr'), []);
  });

  it('12. handles deeply nested JSON structures (10 levels)', async () => {
    let current: any = { depth: 10, value: 'deep_leaf' };
    for (let i = 9; i >= 1; i--) {
      current = { level: i, child: current };
    }

    await wrapper.setEncryptedItem('deep_nest', current);
    const restored = await wrapper.getEncryptedItem<any>('deep_nest');
    assert.strictEqual(restored.child.child.child.child.child.child.child.child.child.value, 'deep_leaf');
  });

  it('13. handles large payload bounds (500KB buffer) without truncation or memory leak', async () => {
    const largeChunk = 'A'.repeat(500 * 1024);
    const largeObject = {
      description: '500KB test payload simulating full offline cache',
      data: largeChunk,
      timestamp: new Date().toISOString(),
    };

    await wrapper.setEncryptedItem('large_payload', largeObject);
    const restored = await wrapper.getEncryptedItem<typeof largeObject>('large_payload');

    assert.ok(restored !== null);
    assert.strictEqual(restored?.data.length, 500 * 1024);
    assert.strictEqual(restored?.description, largeObject.description);
  });

  it('14. handles underlying storage read failure gracefully via getEncryptedItem', async () => {
    await wrapper.setEncryptedItem('fail_read_key', { test: 123 });
    mockStorage.simulateFailureOn('getItem');

    const result = await wrapper.getEncryptedItem('fail_read_key');
    assert.strictEqual(result, null, 'Storage read failure must return null gracefully');
  });

  it('15. bubbles underlying storage write failure when setItem rejects', async () => {
    mockStorage.simulateFailureOn('setItem');
    await assert.rejects(
      async () => {
        await wrapper.setEncryptedItem('fail_write_key', { data: 999 });
      },
      /Simulated storage write failure/
    );
  });

  it('16. handles concurrent write races across 50 keys without race conditions or corrupted values', async () => {
    const writes = Array.from({ length: 50 }, (_, i) =>
      wrapper.setEncryptedItem(`parallel_key_${i}`, { index: i, square: i * i })
    );

    await Promise.all(writes);

    for (let i = 0; i < 50; i++) {
      const val = await wrapper.getEncryptedItem<{ index: number; square: number }>(`parallel_key_${i}`);
      assert.strictEqual(val?.index, i);
      assert.strictEqual(val?.square, i * i);
    }
  });

  it('17. handles rapid consecutive overwrites to the same key correctly', async () => {
    for (let i = 1; i <= 20; i++) {
      await wrapper.setEncryptedItem('rapid_key', { version: i });
    }

    const finalVal = await wrapper.getEncryptedItem<{ version: number }>('rapid_key');
    assert.strictEqual(finalVal?.version, 20);
  });

  it('18. supports special characters in storage keys (slashes, colons, percent, query strings)', async () => {
    const complexKey = '@fiberops:cache/tickets/WO-2025-0842?status=PENDING&ts=100%25';
    await wrapper.setEncryptedItem(complexKey, { ticketId: 'WO-2025-0842' });

    const result = await wrapper.getEncryptedItem<{ ticketId: string }>(complexKey);
    assert.strictEqual(result?.ticketId, 'WO-2025-0842');
  });
});
