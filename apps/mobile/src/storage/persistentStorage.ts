import { encryptData, decryptData } from '../security/deviceIntegrity';

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
  clear?: () => Promise<void> | void;
}

export type StorageBackendType =
  | 'local-storage'
  | 'async-storage'
  | 'secure-store'
  | 'in-memory';

/**
 * Universal persistent storage adapter for FiberOps mobile application.
 * Dynamically resolves the best available storage engine across:
 * 1. window.localStorage (Web / PWA runtime)
 * 2. @react-native-async-storage/async-storage (React Native native runtime)
 * 3. expo-secure-store (Expo managed native runtime)
 * 4. In-Memory fallback Map (Testing, SSR, headless runtimes)
 */
export class PersistentStorageAdapter implements StorageAdapter {
  private inMemoryFallback = new Map<string, string>();
  private resolvedType: StorageBackendType = 'in-memory';
  private asyncStorageModule: any = null;
  private secureStoreModule: any = null;

  constructor() {
    this.detectStorageEngine();
  }

  private detectStorageEngine(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.resolvedType = 'local-storage';
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      if (AsyncStorage) {
        this.asyncStorageModule = AsyncStorage.default || AsyncStorage;
        this.resolvedType = 'async-storage';
        return;
      }
    } catch {
      // Module not available in current environment
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require('expo-secure-store');
      if (SecureStore) {
        this.secureStoreModule = SecureStore;
        this.resolvedType = 'secure-store';
        return;
      }
    } catch {
      // Module not available in current environment
    }

    this.resolvedType = 'in-memory';
  }

  public getBackendType(): StorageBackendType {
    return this.resolvedType;
  }

  public async getItem(key: string): Promise<string | null> {
    try {
      if (this.resolvedType === 'local-storage' && typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }

      if (this.resolvedType === 'async-storage' && this.asyncStorageModule) {
        const val = await this.asyncStorageModule.getItem(key);
        if (val !== null && val !== undefined) return val;
      }

      if (this.resolvedType === 'secure-store' && this.secureStoreModule) {
        const val = await this.secureStoreModule.getItemAsync(key);
        if (val !== null && val !== undefined) return val;
      }
    } catch (err) {
      console.warn(`[PersistentStorageAdapter] Failed reading key "${key}" from ${this.resolvedType}:`, err);
    }

    return this.inMemoryFallback.get(key) ?? null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    try {
      if (this.resolvedType === 'local-storage' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }

      if (this.resolvedType === 'async-storage' && this.asyncStorageModule) {
        await this.asyncStorageModule.setItem(key, value);
        return;
      }

      if (this.resolvedType === 'secure-store' && this.secureStoreModule) {
        await this.secureStoreModule.setItemAsync(key, value);
        return;
      }
    } catch (err) {
      console.warn(`[PersistentStorageAdapter] Failed writing key "${key}" to ${this.resolvedType}:`, err);
    }

    this.inMemoryFallback.set(key, value);
  }

  public async removeItem(key: string): Promise<void> {
    try {
      if (this.resolvedType === 'local-storage' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      } else if (this.resolvedType === 'async-storage' && this.asyncStorageModule) {
        await this.asyncStorageModule.removeItem(key);
      } else if (this.resolvedType === 'secure-store' && this.secureStoreModule) {
        await this.secureStoreModule.deleteItemAsync(key);
      }
    } catch (err) {
      console.warn(`[PersistentStorageAdapter] Failed removing key "${key}" from ${this.resolvedType}:`, err);
    }

    this.inMemoryFallback.delete(key);
  }

  public async clear(): Promise<void> {
    try {
      if (this.resolvedType === 'local-storage' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      } else if (this.resolvedType === 'async-storage' && this.asyncStorageModule) {
        await this.asyncStorageModule.clear();
      }
    } catch (err) {
      console.warn(`[PersistentStorageAdapter] Failed clearing ${this.resolvedType}:`, err);
    }

    this.inMemoryFallback.clear();
  }
}

/**
 * Singleton shared persistent storage instance.
 */
export const persistentStorage = new PersistentStorageAdapter();

/**
 * Retrieves and decrypts a typed JSON item from persistent storage using XOR key-streaming.
 */
export async function getEncryptedItem<T>(key: string): Promise<T | null> {
  try {
    const rawValue = await persistentStorage.getItem(key);
    if (!rawValue) return null;

    const decrypted = await decryptData(rawValue);
    return JSON.parse(decrypted) as T;
  } catch (err) {
    console.warn(`[PersistentStorage] Failed decrypting or parsing key "${key}":`, err);
    return null;
  }
}

/**
 * Encrypts and persists a typed JSON item in persistent storage using XOR key-streaming.
 */
export async function setEncryptedItem<T>(key: string, value: T): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    const encrypted = await encryptData(serialized);
    await persistentStorage.setItem(key, encrypted);
  } catch (err) {
    console.error(`[PersistentStorage] Failed encrypting and saving key "${key}":`, err);
    throw err;
  }
}

/**
 * Removes an encrypted item from persistent storage.
 */
export async function removeEncryptedItem(key: string): Promise<void> {
  await persistentStorage.removeItem(key);
}
