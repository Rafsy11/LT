export const DEFAULT_STALE_TIME_MS = 30_000;

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

interface QueryCacheRegistry {
  entries: Map<string, CacheEntry<unknown>>;
  inFlight: Map<string, Promise<unknown>>;
  listeners: Map<string, Set<() => void>>;
}

declare global {
  interface Window {
    __fiberopsQueryCache?: QueryCacheRegistry;
  }
}

export interface FetchWithCacheOptions {
  force?: boolean;
  staleTimeMs?: number;
}

function getRegistry(): QueryCacheRegistry | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!window.__fiberopsQueryCache) {
    window.__fiberopsQueryCache = {
      entries: new Map(),
      inFlight: new Map(),
      listeners: new Map(),
    };
  }
  return window.__fiberopsQueryCache;
}

function notifyListeners(key: string): void {
  const registry = getRegistry();
  if (!registry) return;

  const keyListeners = registry.listeners.get(key);
  if (!keyListeners) return;

  keyListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore subscriber errors to isolate cache notifications
    }
  });
}

/**
 * Returns cached query data in browser memory if present (regardless of staleness for SWR UI display).
 */
export function getCachedData<T>(key: string): T | null {
  const registry = getRegistry();
  if (!registry) return null;

  const entry = registry.entries.get(key);
  return entry ? (entry.data as T) : null;
}

/**
 * Stores query data in the client cache and notifies active subscribers for that key.
 */
export function setCachedData<T>(key: string, data: T): void {
  const registry = getRegistry();
  if (!registry) return;

  registry.entries.set(key, {
    data,
    updatedAt: Date.now(),
  });
  notifyListeners(key);
}

/**
 * Fetches and caches data with in-flight request deduplication and stale-time short-circuiting.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: FetchWithCacheOptions = {},
): Promise<T> {
  const registry = getRegistry();
  if (!registry) {
    return await fetcher();
  }

  const { force = false, staleTimeMs = DEFAULT_STALE_TIME_MS } = options;

  if (!force) {
    const cached = registry.entries.get(key);
    if (cached && Date.now() - cached.updatedAt < staleTimeMs) {
      return cached.data as T;
    }

    const existingPromise = registry.inFlight.get(key);
    if (existingPromise) {
      return (await existingPromise) as T;
    }
  }

  const requestPromise = fetcher()
    .then((data) => {
      registry.entries.set(key, {
        data,
        updatedAt: Date.now(),
      });
      notifyListeners(key);
      return data;
    })
    .finally(() => {
      if (registry.inFlight.get(key) === requestPromise) {
        registry.inFlight.delete(key);
      }
    });

  registry.inFlight.set(key, requestPromise);
  return await requestPromise;
}

/**
 * Invalidates cache entries matching exact keys or prefixes.
 */
export function invalidateQueryCache(...keysOrPrefixes: string[]): void {
  const registry = getRegistry();
  if (!registry) return;

  const keysToDelete = new Set<string>();
  registry.entries.forEach((_, cachedKey) => {
    for (const target of keysOrPrefixes) {
      if (cachedKey === target || cachedKey.startsWith(target)) {
        keysToDelete.add(cachedKey);
        break;
      }
    }
  });

  keysToDelete.forEach((k) => {
    registry.entries.delete(k);
  });
}

/**
 * Subscribes a listener callback to cache updates for a specific key.
 */
export function subscribeQueryCache(key: string, listener: () => void): () => void {
  const registry = getRegistry();
  if (!registry) {
    return () => {};
  }

  let keyListeners = registry.listeners.get(key);
  if (!keyListeners) {
    keyListeners = new Set();
    registry.listeners.set(key, keyListeners);
  }
  keyListeners.add(listener);

  return () => {
    const current = registry.listeners.get(key);
    if (current) {
      current.delete(listener);
      if (current.size === 0) {
        registry.listeners.delete(key);
      }
    }
  };
}
