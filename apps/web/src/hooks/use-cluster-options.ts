'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClusterOptionItem } from '@repo/shared';
import {
  fetchWithCache,
  getCachedData,
  subscribeQueryCache,
} from '@/lib/query-cache';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';

const CLUSTER_OPTIONS_CACHE_KEY = '/api/v1/admin/clusters/options';
const CLUSTER_OPTIONS_STALE_MS = 60_000;

export interface UseClusterOptionsResult {
  clusters: ClusterOptionItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches active network clusters dynamically from `/api/v1/admin/clusters/options`
 * with shared in-memory deduplication across pages, filters, and modals.
 *
 * @example
 * const { clusters, isLoading } = useClusterOptions();
 */
export function useClusterOptions(): UseClusterOptionsResult {
  const [clusters, setClusters] = useState<ClusterOptionItem[]>(
    () => getCachedData<ClusterOptionItem[]>(CLUSTER_OPTIONS_CACHE_KEY) ?? [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => getCachedData<ClusterOptionItem[]>(CLUSTER_OPTIONS_CACHE_KEY) === null,
  );
  const [error, setError] = useState<string | null>(null);

  const loadClusters = useCallback(async (force = false) => {
    try {
      const list = await fetchWithCache<ClusterOptionItem[]>(
        CLUSTER_OPTIONS_CACHE_KEY,
        async () => {
          const json = await webApiClient.get<ClusterOptionItem[]>(CLUSTER_OPTIONS_CACHE_KEY);
          if (!json.success || !Array.isArray(json.data)) {
            throw normalizeAppError(!json.success ? json.error : null, {
              fallbackMessage: 'Daftar cluster wilayah belum dapat dimuat saat ini.',
            });
          }
          return json.data;
        },
        { force, staleTimeMs: CLUSTER_OPTIONS_STALE_MS },
      );

      setClusters(list);
      setError(null);
    } catch (err) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Daftar cluster wilayah belum dapat dimuat saat ini.',
      });
      setError(normalized.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClusters(false);

    const unsubscribe = subscribeQueryCache(CLUSTER_OPTIONS_CACHE_KEY, () => {
      const cached = getCachedData<ClusterOptionItem[]>(CLUSTER_OPTIONS_CACHE_KEY);
      if (Array.isArray(cached)) {
        setClusters(cached);
        setIsLoading(false);
      }
    });

    const handleRefresh = () => {
      void loadClusters(true);
    };
    window.addEventListener('app:refresh-data', handleRefresh);

    return () => {
      unsubscribe();
      window.removeEventListener('app:refresh-data', handleRefresh);
    };
  }, [loadClusters]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await loadClusters(true);
  }, [loadClusters]);

  return { clusters, isLoading, error, refresh };
}

