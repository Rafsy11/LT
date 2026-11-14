/**
 * Mock Persistent Storage Adapter & Cryptography Helpers
 * Implements PersistentStorageAdapter contract specified in PROJECT.md Interface Contracts.
 */

export interface PersistentStorageAdapterContract {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys?(): Promise<string[]>;
}

export class MockPersistentStorage implements PersistentStorageAdapterContract {
  private store: Map<string, string> = new Map();
  private failNextOp: string | null = null;

  async getItem(key: string): Promise<string | null> {
    if (this.failNextOp === 'getItem') {
      this.failNextOp = null;
      throw new Error('Simulated storage read failure');
    }
    const val = this.store.get(key);
    return val !== undefined ? val : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failNextOp === 'setItem') {
      this.failNextOp = null;
      throw new Error('Simulated storage write failure');
    }
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.failNextOp === 'removeItem') {
      this.failNextOp = null;
      throw new Error('Simulated storage delete failure');
    }
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  // Simulation controls
  simulateFailureOn(op: 'getItem' | 'setItem' | 'removeItem'): void {
    this.failNextOp = op;
  }

  getRawStore(): Map<string, string> {
    return this.store;
  }
}

/**
 * Canonical XOR encryption / decryption helper matching mobile persistentStorage contract
 */
const DEFAULT_STORAGE_KEY = 'FIBEROPS_OFFLINE_SECRET_KEY_PLB_2026';

export function xorEncrypt(text: string, secretKey: string = DEFAULT_STORAGE_KEY): string {
  const textBuffer = Buffer.from(text, 'utf-8');
  const keyBuffer = Buffer.from(secretKey, 'utf-8');
  const result = Buffer.alloc(textBuffer.length);

  for (let i = 0; i < textBuffer.length; i++) {
    result[i] = textBuffer[i] ^ keyBuffer[i % keyBuffer.length];
  }

  return result.toString('base64');
}

export function xorDecrypt(cipherBase64: string, secretKey: string = DEFAULT_STORAGE_KEY): string {
  const cipherBuffer = Buffer.from(cipherBase64, 'base64');
  const keyBuffer = Buffer.from(secretKey, 'utf-8');
  const result = Buffer.alloc(cipherBuffer.length);

  for (let i = 0; i < cipherBuffer.length; i++) {
    result[i] = cipherBuffer[i] ^ keyBuffer[i % keyBuffer.length];
  }

  return result.toString('utf-8');
}

export class EncryptedStorageWrapper {
  constructor(
    private adapter: PersistentStorageAdapterContract = new MockPersistentStorage(),
    private secretKey: string = DEFAULT_STORAGE_KEY
  ) {}

  async getEncryptedItem<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.adapter.getItem(key);
      if (!raw) return null;
      const decrypted = xorDecrypt(raw, this.secretKey);
      return JSON.parse(decrypted) as T;
    } catch {
      return null;
    }
  }

  async setEncryptedItem<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    const encrypted = xorEncrypt(serialized, this.secretKey);
    await this.adapter.setItem(key, encrypted);
  }

  async removeEncryptedItem(key: string): Promise<void> {
    await this.adapter.removeItem(key);
  }

  getAdapter(): PersistentStorageAdapterContract {
    return this.adapter;
  }
}
