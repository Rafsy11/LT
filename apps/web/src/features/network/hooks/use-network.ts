'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  ClusterListItem,
  NetworkStats,
  CreateTicketInput,
  OdpHistoryEntry,
  NetworkAuditResult,
} from '@repo/shared';
import {
  ATTENUATION_THRESHOLDS,
  classifyDbm,
  isAttenuationBad,
  STANDARD_ERROR_MESSAGES,
} from '@repo/shared';
import { useToast, useAuth } from '@/providers';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';

const CLUSTERS_CACHE_KEY = '/api/v1/admin/clusters';
const CLUSTER_OPTIONS_CACHE_KEY = '/api/v1/admin/clusters/options';
const ODP_MAPS_CACHE_KEY = '/api/v1/admin/maps/odp';
const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';
const AUDIT_TIMEOUT_MS = 30_000;

export type OdpQuickFilter = 'ALL' | 'ABNORMAL' | 'AVAILABLE' | 'FULL';
export type PortAllocationFilter = 'ALL' | 'OCCUPIED' | 'AVAILABLE' | 'CRITICAL';
export type NetworkDetailTab = 'ports' | 'riwayat' | 'audit';
export type SplitterHealthState = 'abnormal' | 'full' | 'normal' | 'unmeasured';

export interface ClusterGroup {
  clusterCode: string;
  name: string;
  splitters: ClusterListItem[];
  totalUsed: number;
  totalPorts: number;
  abnormalCount: number;
}

export interface AttenuationMeta {
  label: string;
  tone: string;
  badge: string;
  status: 'normal' | 'warning' | 'critical' | 'neutral';
}

export interface OdpHistoryLogItem {
  portNumber: number;
  type: 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN';
  date: string;
  technician: string;
  ticketNumber: string;
  customerName: string;
  attenuationDelta: string;
  notes: string;
}

/**
 * Classifies an ODP splitter's operational health under the 28 dB optical attenuation standard.
 *
 * @param splitter - Splitter record containing its port measurements and occupancy.
 * @returns Health category prioritizing bad attenuation (> 28 dB) before capacity fullness.
 * @example
 * const health = getSplitterHealth(activeSplitter);
 */
export function getSplitterHealth(splitter: ClusterListItem): {
  state: SplitterHealthState;
  badPortCount: number;
  measuredPortCount: number;
  worstAttenuation: number | null;
} {
  const occupied = splitter.ports.filter((p) => p.isOccupied);
  const measured = occupied.filter(
    (p) => typeof p.attenuation === 'number' && p.attenuation !== 0,
  );
  const badPorts = measured.filter((p) => isAttenuationBad(p.attenuation));
  const worstAttenuation =
    measured.length > 0
      ? measured.reduce(
          (worst, p) => Math.min(worst, p.attenuation as number),
          measured[0].attenuation as number,
        )
      : null;

  if (badPorts.length > 0) {
    return {
      state: 'abnormal',
      badPortCount: badPorts.length,
      measuredPortCount: measured.length,
      worstAttenuation,
    };
  }
  if (splitter.maxPorts > 0 && splitter.usedPorts >= splitter.maxPorts) {
    return {
      state: 'full',
      badPortCount: 0,
      measuredPortCount: measured.length,
      worstAttenuation,
    };
  }
  if (measured.length > 0) {
    return {
      state: 'normal',
      badPortCount: 0,
      measuredPortCount: measured.length,
      worstAttenuation,
    };
  }
  return {
    state: 'unmeasured',
    badPortCount: 0,
    measuredPortCount: 0,
    worstAttenuation: null,
  };
}

/**
 * Formats the PLC optical splitter ratio label from port capacity.
 *
 * @param maxPorts - Maximum splitter port count (8, 16, or 32).
 * @returns Human-readable PLC splitter ratio label.
 * @example
 * formatSplitterRatio(16); // "1x16 PLC"
 */
export function formatSplitterRatio(maxPorts: number): string {
  if (maxPorts === 8) return '1x8 PLC';
  if (maxPorts === 16) return '1x16 PLC';
  if (maxPorts === 32) return '1x32 PLC';
  return `1x${maxPorts} PLC`;
}

export function useNetwork() {
  const searchParams = useSearchParams();
  const initialOdpParam = searchParams.get('odp') || '';
  const initialSearchParam = searchParams.get('search') || '';
  const initialClusterParam = searchParams.get('cluster') || '';

  const [search, setSearch] = useState(() => initialSearchParam || initialClusterParam);
  const [odpQuickFilter, setOdpQuickFilter] = useState<OdpQuickFilter>('ALL');
  const [activeSplitterCode, setActiveSplitterCode] = useState<string>(() => initialOdpParam);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [networkData, setNetworkData] = useState<ClusterListItem[]>(
    () => getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [portFilter, setPortFilter] = useState<PortAllocationFilter>('ALL');
  const [activeTab, setActiveTab] = useState<NetworkDetailTab>('ports');
  const [expandedPortNum, setExpandedPortNum] = useState<number | null>(null);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<
    'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN'
  >('ALL');
  const [odpHistoryLogs, setOdpHistoryLogs] = useState<OdpHistoryLogItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<NetworkAuditResult | null>(null);
  const [auditTimestamp, setAuditTimestamp] = useState<string>('Belum diaudit');
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketModalInitial, setTicketModalInitial] = useState<Partial<CreateTicketInput>>({});

  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();
  const { clusters: clusterOptions } = useClusterOptions();

  const fetchClusters = useCallback(
    async (force = false) => {
      try {
        setLoadError(null);
        if (!getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<ClusterListItem[]>(
          CLUSTERS_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<{ clusters?: ClusterListItem[] }>(
              CLUSTERS_CACHE_KEY,
            );
            if (!json.success || !json.data?.clusters) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: 'Data topologi jaringan belum dapat dimuat saat ini.',
              });
            }
            return json.data.clusters;
          },
          { force },
        );
        setNetworkData(data);
      } catch (err) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
        });
        setLoadError(normalized.message);
        showError(normalized, {
          onRetry:
            normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
              ? () => void fetchClusters(true)
              : undefined,
        });
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchClusters();
  }, [fetchClusters]);

  // Honor deep-link ?odp= param when data arrives or URL query updates
  useEffect(() => {
    if (!initialOdpParam || networkData.length === 0) return;
    const matched = networkData.find(
      (c) => c.splitterCode.toLowerCase() === initialOdpParam.toLowerCase(),
    );
    if (matched) {
      setActiveSplitterCode(matched.splitterCode);
      setExpandedClusters((prev) => ({
        ...prev,
        [matched.clusterCode]: true,
      }));
    }
  }, [initialOdpParam, networkData]);

  const handleCreateTicketSubmit = async (data: CreateTicketInput) => {
    const json = await webApiClient.post(TICKETS_CACHE_KEY, data);
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Tiket baru belum dapat dibuat saat ini.',
      });
    }
    invalidateQueryCache(
      CLUSTERS_CACHE_KEY,
      TICKETS_CACHE_KEY,
      OVERVIEW_CACHE_KEY,
      ODP_MAPS_CACHE_KEY,
    );
    await fetchClusters(true);
  };

  const toggleClusterExpand = useCallback((clusterCode: string) => {
    setExpandedClusters((prev) => ({
      ...prev,
      [clusterCode]: !prev[clusterCode],
    }));
  }, []);

  const networkStats: NetworkStats & { abnormalOdpCount: number; abnormalPortCount: number } =
    useMemo(() => {
      const totalClusters = new Set(networkData.map((c) => c.clusterCode)).size;
      const totalSplitters = networkData.length;
      let totalCapacity = 0;
      let usedCapacity = 0;
      let abnormalOdpCount = 0;
      let abnormalPortCount = 0;

      networkData.forEach((item) => {
        totalCapacity += item.maxPorts || 0;
        usedCapacity += item.usedPorts || 0;
        const health = getSplitterHealth(item);
        if (health.badPortCount > 0) {
          abnormalOdpCount += 1;
          abnormalPortCount += health.badPortCount;
        }
      });

      return {
        totalClusters,
        totalSplitters,
        totalCapacity,
        usedCapacity,
        availableCapacity: Math.max(0, totalCapacity - usedCapacity),
        abnormalOdpCount,
        abnormalPortCount,
      };
    }, [networkData]);

  const filteredClusters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return networkData.filter((c) => {
      const matchesSearch =
        q === '' ||
        c.name.toLowerCase().includes(q) ||
        c.clusterCode.toLowerCase().includes(q) ||
        c.splitterCode.toLowerCase().includes(q) ||
        (c.locationName && c.locationName.toLowerCase().includes(q)) ||
        c.ports.some(
          (p) =>
            (p.customerName && p.customerName.toLowerCase().includes(q)) ||
            (p.siaNumber && p.siaNumber.toLowerCase().includes(q)),
        );

      if (!matchesSearch) return false;

      if (odpQuickFilter === 'ABNORMAL') {
        return getSplitterHealth(c).badPortCount > 0;
      }
      if (odpQuickFilter === 'AVAILABLE') {
        return c.usedPorts < c.maxPorts;
      }
      if (odpQuickFilter === 'FULL') {
        return c.maxPorts > 0 && c.usedPorts >= c.maxPorts;
      }
      return true;
    });
  }, [networkData, search, odpQuickFilter]);

  const clusterGroups: ClusterGroup[] = useMemo(() => {
    const map = new Map<string, ClusterGroup>();

    for (const item of filteredClusters) {
      const isAbnormal = getSplitterHealth(item).badPortCount > 0;
      const existing = map.get(item.clusterCode);
      if (existing) {
        existing.splitters.push(item);
        existing.totalUsed += item.usedPorts;
        existing.totalPorts += item.maxPorts;
        if (isAbnormal) existing.abnormalCount += 1;
      } else {
        map.set(item.clusterCode, {
          clusterCode: item.clusterCode,
          name: item.name,
          splitters: [item],
          totalUsed: item.usedPorts,
          totalPorts: item.maxPorts,
          abnormalCount: isAbnormal ? 1 : 0,
        });
      }
    }

    return Array.from(map.values());
  }, [filteredClusters]);

  const activeSplitter = useMemo(() => {
    if (activeSplitterCode) {
      const found = filteredClusters.find((c) => c.splitterCode === activeSplitterCode);
      if (found) return found;
      const fallbackGlobal = networkData.find((c) => c.splitterCode === activeSplitterCode);
      if (fallbackGlobal && filteredClusters.length === 0) return fallbackGlobal;
    }
    return filteredClusters[0] || networkData[0] || null;
  }, [filteredClusters, networkData, activeSplitterCode]);

  const activeSplitterHealth = useMemo(
    () => (activeSplitter ? getSplitterHealth(activeSplitter) : null),
    [activeSplitter],
  );

  const activeSplitterFilteredPorts = useMemo(() => {
    if (!activeSplitter) return [];
    if (portFilter === 'OCCUPIED') {
      return activeSplitter.ports.filter((p) => p.isOccupied);
    }
    if (portFilter === 'AVAILABLE') {
      return activeSplitter.ports.filter((p) => !p.isOccupied);
    }
    if (portFilter === 'CRITICAL') {
      return activeSplitter.ports.filter(
        (p) => p.isOccupied && typeof p.attenuation === 'number' && isAttenuationBad(p.attenuation),
      );
    }
    return activeSplitter.ports;
  }, [activeSplitter, portFilter]);

  // Keep active splitter valid and ensure only the active cluster expands by default
  useEffect(() => {
    if (filteredClusters.length > 0) {
      const target =
        filteredClusters.find((c) => c.splitterCode === activeSplitterCode) ?? filteredClusters[0];
      if (target.splitterCode !== activeSplitterCode) {
        setActiveSplitterCode(target.splitterCode);
      }
      setExpandedClusters((prev) => {
        if (Object.keys(prev).length === 0) {
          return { [target.clusterCode]: true };
        }
        return prev;
      });
    }
  }, [filteredClusters, activeSplitterCode]);

  const selectSplitter = useCallback((splitterCode: string, clusterCode?: string) => {
    setActiveSplitterCode(splitterCode);
    setExpandedPortNum(null);
    setPortFilter('ALL');
    if (clusterCode) {
      setExpandedClusters((prev) => ({ ...prev, [clusterCode]: true }));
    }
  }, []);

  const getAttenuationMeta = useCallback((att: number | undefined): AttenuationMeta => {
    if (att === undefined || att === null || att === 0) {
      return { label: 'Belum diukur', tone: 'neutral', badge: 'badge gray', status: 'neutral' };
    }
    const status = classifyDbm(att);
    if (status === 'Normal') {
      return {
        label: `${att.toFixed(1)} dBm (Bagus)`,
        tone: 'normal',
        badge: 'badge green',
        status: 'normal',
      };
    }
    if (status === 'Warning') {
      return {
        label: `${att.toFixed(1)} dBm (Layak <= ${ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB} dB)`,
        tone: 'warning',
        badge: 'badge yellow',
        status: 'warning',
      };
    }
    return {
      label: `${att.toFixed(1)} dBm (Jelek > ${ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB} dB)`,
      tone: 'critical',
      badge: 'badge red',
      status: 'critical',
    };
  }, []);

  const activeSplitterClusterCode = activeSplitter?.clusterCode || '';
  const activeSplitterKey = activeSplitter?.splitterCode || '';

  useEffect(() => {
    if (!activeSplitterKey) {
      setOdpHistoryLogs([]);
      return;
    }

    let cancelled = false;
    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        const query = new URLSearchParams({
          cluster: activeSplitterClusterCode,
          splitter: activeSplitterKey,
        });
        const json = await webApiClient.get<OdpHistoryEntry[]>(
          `/api/v1/admin/clusters/history?${query.toString()}`,
        );
        if (cancelled) return;

        if (!json.success || !Array.isArray(json.data)) {
          setOdpHistoryLogs([]);
          return;
        }

        const mapped: OdpHistoryLogItem[] = json.data.map((entry) => {
          const mappedType: OdpHistoryLogItem['type'] =
            entry.actionType === 'PENARIKAN'
              ? 'PENARIKAN'
              : entry.actionType === 'MAINTENANCE'
                ? 'MAINTENANCE'
                : 'PEMASANGAN';
          const delta =
            entry.oldAttenuation !== null
              ? `${entry.oldAttenuation.toFixed(1)} dBm → ${entry.newAttenuation.toFixed(1)} dBm`
              : `Redaman: ${entry.newAttenuation.toFixed(1)} dBm`;

          const formattedDate = new Date(entry.timestamp).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return {
            portNumber: entry.portNumber,
            type: mappedType,
            date: `${formattedDate} WIB`,
            technician: entry.technicianName,
            ticketNumber: entry.ticketNumber,
            customerName: entry.customerName,
            attenuationDelta: delta,
            notes: entry.notes || 'Pengukuran redaman optik tercatat pada riwayat jaringan.',
          };
        });

        setOdpHistoryLogs(mapped);
      } catch {
        if (!cancelled) {
          setOdpHistoryLogs([]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [activeSplitterClusterCode, activeSplitterKey]);

  const handleRunAudit = useCallback(async () => {
    if (auditRunning) return;
    setAuditRunning(true);
    try {
      const json = await webApiClient.post<NetworkAuditResult>(
        '/api/v1/admin/clusters/audit',
        {},
        { timeoutMs: AUDIT_TIMEOUT_MS },
      );
      if (!json.success || !json.data) {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Audit integritas jaringan belum dapat dijalankan saat ini.',
        });
      }

      const result = json.data;
      setAuditResult(result);
      setAuditTimestamp(
        new Date(result.auditedAt).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB',
      );

      if (result.findings.length === 0) {
        showSuccess(
          `Audit selesai: ${result.totalSplitters} ODP tervalidasi sehat (${result.usedPorts}/${result.totalPorts} port terisi, 0 bentrok).`,
        );
      } else {
        showSuccess(
          `Audit selesai: ditemukan ${result.findings.length} temuan kapasitas, redaman, atau koordinat dari ${result.totalSplitters} ODP.`,
        );
      }
    } catch (err) {
      showError(err);
    } finally {
      setAuditRunning(false);
    }
  }, [auditRunning, showError, showSuccess]);

  const handleCreateCluster = async (
    payload: import('@repo/shared').CreateClusterInput,
  ) => {
    const json = await webApiClient.post('/api/v1/admin/clusters', {
      ...payload,
      entityType: 'CLUSTER',
    });
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Wilayah cluster baru belum dapat ditambahkan.',
      });
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY, ODP_MAPS_CACHE_KEY);
    showSuccess(`Cluster ${payload.name} (${payload.clusterCode}) berhasil ditambahkan.`);
    await fetchClusters(true);
  };

  const handleCreateSplitter = async (
    payload: import('@repo/shared').CreateSplitterInput,
  ) => {
    const json = await webApiClient.post('/api/v1/admin/clusters', {
      ...payload,
      entityType: 'SPLITTER',
    });
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Titik ODP splitter baru belum dapat ditambahkan.',
      });
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY, ODP_MAPS_CACHE_KEY);
    showSuccess(`ODP ${payload.splitterCode} (${payload.maxPorts} port) berhasil ditambahkan.`);
    selectSplitter(payload.splitterCode, payload.clusterCode);
    await fetchClusters(true);
  };

  const handleUpdateSplitter = async (
    payload: import('@repo/shared').UpdateSplitterInput,
  ) => {
    const json = await webApiClient.patch('/api/v1/admin/clusters', payload);
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Data ODP splitter belum dapat diperbarui.',
      });
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY, ODP_MAPS_CACHE_KEY);
    showSuccess(`Data ODP ${payload.splitterCode} berhasil diperbarui.`);
    await fetchClusters(true);
  };

  const resetTreeFilters = useCallback(() => {
    setSearch('');
    setOdpQuickFilter('ALL');
  }, []);

  return {
    search,
    setSearch,
    odpQuickFilter,
    setOdpQuickFilter,
    resetTreeFilters,
    activeSplitterCode,
    setActiveSplitterCode: selectSplitter,
    expandedClusters,
    toggleClusterExpand,
    networkData,
    loading,
    loadError,
    portFilter,
    setPortFilter,
    activeTab,
    setActiveTab,
    expandedPortNum,
    setExpandedPortNum,
    historyTypeFilter,
    setHistoryTypeFilter,
    historyLoading,
    auditRunning,
    auditResult,
    auditTimestamp,
    clusterOptions,
    ticketModalOpen,
    setTicketModalOpen,
    ticketModalInitial,
    setTicketModalInitial,
    networkStats,
    filteredClusters,
    clusterGroups,
    activeSplitter,
    activeSplitterHealth,
    activeSplitterFilteredPorts,
    getAttenuationMeta,
    odpHistoryLogs,
    handleCreateTicketSubmit,
    handleRunAudit,
    handleCreateCluster,
    handleCreateSplitter,
    handleUpdateSplitter,
    showSuccess,
    canCreateTicket,
    fetchClusters,
  };
}
