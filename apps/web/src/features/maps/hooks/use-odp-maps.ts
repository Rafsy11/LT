'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  STANDARD_ERROR_MESSAGES,
  type OdpMapRadarItem,
  type OdpRadarStatus,
  type OdpRadarSummary,
} from '@repo/shared';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { fetchWithCache, getCachedData } from '@/lib/query-cache';
import { useToast } from '@/providers';

export type MapStatusFilter = 'ALL' | OdpRadarStatus;
export type MapLayerStyle = 'street' | 'satellite';

const ODP_MAPS_CACHE_KEY = '/api/v1/admin/maps/odp';
const VALID_STATUS_FILTERS = new Set<MapStatusFilter>(['ALL', 'NORMAL', 'ABNORMAL', 'UNMEASURED']);

interface OdpRadarApiResponse {
  items: OdpMapRadarItem[];
  summary: OdpRadarSummary;
}

const EMPTY_SUMMARY: OdpRadarSummary = {
  totalOdps: 0,
  normalCount: 0,
  abnormalCount: 0,
  unmeasuredCount: 0,
  badAttenuationCustomers: 0,
  mappedCustomers: 0,
};

function parseStatusParam(raw: string | null): MapStatusFilter {
  if (!raw) return 'ALL';
  const normalized = raw.trim().toUpperCase() as MapStatusFilter;
  return VALID_STATUS_FILTERS.has(normalized) ? normalized : 'ALL';
}

export function useOdpMaps() {
  const searchParams = useSearchParams();
  const { showError } = useToast();

  const initialOdpParam = searchParams.get('odp') || '';
  const initialSiaParam = searchParams.get('sia') || '';
  const initialClusterParam = searchParams.get('cluster') || '';
  const initialStatusParam = parseStatusParam(searchParams.get('status'));

  const cachedPayload = getCachedData<OdpRadarApiResponse>(ODP_MAPS_CACHE_KEY);

  const [items, setItems] = useState<OdpMapRadarItem[]>(() => cachedPayload?.items ?? []);
  const [summary, setSummary] = useState<OdpRadarSummary>(
    () => cachedPayload?.summary ?? EMPTY_SUMMARY,
  );
  const [loading, setLoading] = useState(() => !cachedPayload);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<MapStatusFilter>(initialStatusParam);
  const [clusterFilter, setClusterFilter] = useState<string>(
    initialClusterParam || 'Semua cluster',
  );
  const [search, setSearch] = useState<string>('');
  const [mapLayer, setMapLayer] = useState<MapLayerStyle>('street');
  const [showCustomerLinks, setShowCustomerLinks] = useState<boolean>(true);
  const [selectedOdpId, setSelectedOdpId] = useState<string | null>(null);

  const applyInitialSelection = useCallback(
    (radarItems: OdpMapRadarItem[]) => {
      if (initialClusterParam) {
        const matchedCluster = radarItems.find(
          (item) =>
            item.clusterCode.toLowerCase() === initialClusterParam.toLowerCase() ||
            item.clusterName.toLowerCase() === initialClusterParam.toLowerCase(),
        );
        if (matchedCluster) {
          setClusterFilter(matchedCluster.clusterCode);
        }
      }

      if (initialOdpParam || initialSiaParam) {
        const matched = radarItems.find(
          (item) =>
            (initialOdpParam &&
              (item.splitterCode.toLowerCase() === initialOdpParam.toLowerCase() ||
                item.id === initialOdpParam)) ||
            (initialSiaParam &&
              item.customers.some(
                (c) => c.siaNumber.toLowerCase() === initialSiaParam.toLowerCase(),
              )),
        );
        if (matched) {
          setSelectedOdpId(matched.id);
          return;
        }
      }

      setSelectedOdpId((prev) => {
        if (prev && radarItems.some((i) => i.id === prev)) return prev;
        const firstAbnormal = radarItems.find((i) => i.radarStatus === 'ABNORMAL');
        return firstAbnormal?.id ?? radarItems[0]?.id ?? null;
      });
    },
    [initialClusterParam, initialOdpParam, initialSiaParam],
  );

  const fetchRadarData = useCallback(
    async (force = false) => {
      try {
        if (force || !getCachedData<OdpRadarApiResponse>(ODP_MAPS_CACHE_KEY)) {
          setLoading(true);
        }
        setLoadError(null);
        const data = await fetchWithCache<OdpRadarApiResponse>(
          ODP_MAPS_CACHE_KEY,
          async () => {
            const res = await webApiClient.get<OdpRadarApiResponse>(ODP_MAPS_CACHE_KEY);
            if (!res.success || !res.data) {
              throw normalizeAppError(!res.success ? res.error : null, {
                fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
              });
            }
            return res.data;
          },
          { force },
        );
        setItems(data.items);
        setSummary(data.summary);
        applyInitialSelection(data.items);
      } catch (err: unknown) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
        });
        setLoadError(normalized.message);
        showError(normalized);
      } finally {
        setLoading(false);
      }
    },
    [applyInitialSelection, showError],
  );

  useEffect(() => {
    void fetchRadarData(false);
  }, [fetchRadarData]);

  const availableClusters = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (!map.has(item.clusterCode)) {
        map.set(item.clusterCode, item.clusterName);
      }
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.radarStatus !== statusFilter) {
        return false;
      }
      if (
        clusterFilter !== 'Semua cluster' &&
        item.clusterCode !== clusterFilter &&
        item.clusterName !== clusterFilter
      ) {
        return false;
      }
      if (q) {
        const matchesOdp =
          item.splitterCode.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.clusterCode.toLowerCase().includes(q) ||
          item.clusterName.toLowerCase().includes(q);
        const matchesCustomer = item.customers.some(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            c.siaNumber.toLowerCase().includes(q) ||
            (c.picName && c.picName.toLowerCase().includes(q)),
        );
        if (!matchesOdp && !matchesCustomer) return false;
      }
      return true;
    });
  }, [items, statusFilter, clusterFilter, search]);

  const selectedOdp = useMemo(() => {
    return (
      filteredItems.find((i) => i.id === selectedOdpId) ||
      items.find((i) => i.id === selectedOdpId) ||
      filteredItems[0] ||
      null
    );
  }, [filteredItems, items, selectedOdpId]);

  const filteredSummary = useMemo<OdpRadarSummary>(() => {
    if (clusterFilter === 'Semua cluster' && !search.trim()) {
      return summary;
    }
    const scoped = items.filter((item) => {
      if (
        clusterFilter !== 'Semua cluster' &&
        item.clusterCode !== clusterFilter &&
        item.clusterName !== clusterFilter
      ) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          item.splitterCode.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.customers.some(
            (c) =>
              c.fullName.toLowerCase().includes(q) || c.siaNumber.toLowerCase().includes(q),
          )
        );
      }
      return true;
    });
    return {
      totalOdps: scoped.length,
      normalCount: scoped.filter((i) => i.radarStatus === 'NORMAL').length,
      abnormalCount: scoped.filter((i) => i.radarStatus === 'ABNORMAL').length,
      unmeasuredCount: scoped.filter((i) => i.radarStatus === 'UNMEASURED').length,
      badAttenuationCustomers: scoped.reduce((sum, i) => sum + i.badPortCount, 0),
      mappedCustomers: scoped.reduce((sum, i) => sum + i.customers.length, 0),
    };
  }, [items, summary, clusterFilter, search]);

  return {
    items,
    filteredItems,
    summary: filteredSummary,
    loading,
    loadError,
    statusFilter,
    setStatusFilter,
    clusterFilter,
    setClusterFilter,
    availableClusters,
    search,
    setSearch,
    mapLayer,
    setMapLayer,
    showCustomerLinks,
    setShowCustomerLinks,
    selectedOdp,
    setSelectedOdpId,
    highlightedSia: initialSiaParam,
    refetch: () => fetchRadarData(true),
  };
}
