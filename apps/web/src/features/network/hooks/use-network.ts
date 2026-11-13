'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ClusterListItem,
  SplitterPortState,
  NetworkStats,
  CustomerListItem,
  CreateTicketInput,
  OdpHistoryEntry,
  NetworkAuditResult,
} from '@repo/shared';
import { useToast, useAuth } from '@/providers';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { clearServiceUnavailable, notifyApiResponseError } from '@/lib/api-error';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';

const CLUSTERS_CACHE_KEY = '/api/v1/admin/clusters';
const CLUSTER_OPTIONS_CACHE_KEY = '/api/v1/admin/clusters/options';
const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';

export interface SelectedPortContext {
  clusterCode: string;
  clusterName: string;
  splitterCode: string;
  lat: number;
  lng: number;
  port: SplitterPortState;
}

export interface ClusterGroup {
  clusterCode: string;
  name: string;
  splitters: ClusterListItem[];
  totalUsed: number;
  totalPorts: number;
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

export function useNetwork() {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('Semua cluster');
  const [portStatusFilter, setPortStatusFilter] = useState('Semua');
  const [activeSplitterCode, setActiveSplitterCode] = useState<string>('');
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [networkData, setNetworkData] = useState<ClusterListItem[]>(
    () => getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY),
  );
  const [selectedPort, setSelectedPort] = useState<SelectedPortContext | null>(null);
  const [portFilter, setPortFilter] = useState<'ALL' | 'OCCUPIED' | 'AVAILABLE'>('ALL');
  const [activeTab, setActiveTab] = useState<'ports' | 'inspeksi' | 'riwayat' | 'audit'>('ports');
  const [expandedPortNum, setExpandedPortNum] = useState<number | null>(1);
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<CustomerListItem | null>(
    null,
  );
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
        if (!getCachedData<ClusterListItem[]>(CLUSTERS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<ClusterListItem[]>(
          CLUSTERS_CACHE_KEY,
          async () => {
            const res = await fetch(CLUSTERS_CACHE_KEY);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success || !json.data?.clusters) {
              const parsed = notifyApiResponseError(
                res.status,
                json,
                'Gagal mengambil data cluster jaringan dari PostgreSQL',
                { category: 'database', source: CLUSTERS_CACHE_KEY },
              );
              throw new Error(parsed.message);
            }
            clearServiceUnavailable('database');
            return json.data.clusters as ClusterListItem[];
          },
          { force },
        );
        setNetworkData(data);
      } catch (err) {
        showError(err);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchClusters();
  }, [fetchClusters]);

  const handleCreateTicketSubmit = async (data: CreateTicketInput) => {
    const res = await fetch(TICKETS_CACHE_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, TICKETS_CACHE_KEY, OVERVIEW_CACHE_KEY);
    await fetchClusters(true);
  };

  const handlePortClick = (c: ClusterListItem, port: SplitterPortState) => {
    if (
      selectedPort &&
      selectedPort.splitterCode === c.splitterCode &&
      selectedPort.port.portNumber === port.portNumber
    ) {
      setSelectedPort(null);
    } else {
      setSelectedPort({
        clusterCode: c.clusterCode,
        clusterName: c.name,
        splitterCode: c.splitterCode,
        lat: c.lat,
        lng: c.lng,
        port,
      });
    }
  };

  const toggleClusterExpand = (clusterCode: string) => {
    setExpandedClusters((prev) => ({
      ...prev,
      [clusterCode]: !prev[clusterCode],
    }));
  };

  const networkStats: NetworkStats = useMemo(() => {
    const totalClusters = new Set(networkData.map((c) => c.clusterCode)).size;
    const totalSplitters = networkData.length;
    let totalCapacity = 0;
    let usedCapacity = 0;

    networkData.forEach((item) => {
      totalCapacity += item.maxPorts || 0;
      usedCapacity += item.usedPorts || 0;
    });

    return {
      totalClusters,
      totalSplitters,
      totalCapacity,
      usedCapacity,
      availableCapacity: Math.max(0, totalCapacity - usedCapacity),
    };
  }, [networkData]);

  const filteredClusters = useMemo(() => {
    return networkData.filter((c) => {
      const matchesCluster =
        clusterFilter === 'Semua cluster' ||
        c.name.toLowerCase().includes(clusterFilter.replace('Bandung ', '').toLowerCase());
      const matchesSearch =
        search.trim() === '' ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.clusterCode.toLowerCase().includes(search.toLowerCase()) ||
        c.splitterCode.toLowerCase().includes(search.toLowerCase()) ||
        c.ports.some(
          (p) =>
            (p.customerName && p.customerName.toLowerCase().includes(search.toLowerCase())) ||
            (p.siaNumber && p.siaNumber.toLowerCase().includes(search.toLowerCase())),
        );

      const matchesPortStatus =
        portStatusFilter === 'Semua' ||
        (portStatusFilter === 'Tersedia' && c.usedPorts < c.maxPorts) ||
        (portStatusFilter === 'Penuh' && c.usedPorts >= c.maxPorts);

      return matchesCluster && matchesSearch && matchesPortStatus;
    });
  }, [networkData, clusterFilter, search, portStatusFilter]);

  const clusterGroups: ClusterGroup[] = useMemo(() => {
    const map = new Map<string, ClusterGroup>();

    for (const item of filteredClusters) {
      const existing = map.get(item.clusterCode);
      if (existing) {
        existing.splitters.push(item);
        existing.totalUsed += item.usedPorts;
        existing.totalPorts += item.maxPorts;
      } else {
        map.set(item.clusterCode, {
          clusterCode: item.clusterCode,
          name: item.name,
          splitters: [item],
          totalUsed: item.usedPorts,
          totalPorts: item.maxPorts,
        });
      }
    }

    return Array.from(map.values());
  }, [filteredClusters]);

  const activeSplitter = useMemo(() => {
    if (activeSplitterCode) {
      const found = filteredClusters.find((c) => c.splitterCode === activeSplitterCode);
      if (found) return found;
    }
    return filteredClusters[0] || null;
  }, [filteredClusters, activeSplitterCode]);

  const activeSplitterFilteredPorts = useMemo(() => {
    if (!activeSplitter) return [];
    if (portFilter === 'OCCUPIED') {
      return activeSplitter.ports.filter((p) => p.isOccupied);
    }
    if (portFilter === 'AVAILABLE') {
      return activeSplitter.ports.filter((p) => !p.isOccupied);
    }
    return activeSplitter.ports;
  }, [activeSplitter, portFilter]);

  useEffect(() => {
    if (filteredClusters.length > 0) {
      if (
        !activeSplitterCode ||
        !filteredClusters.some((c) => c.splitterCode === activeSplitterCode)
      ) {
        setActiveSplitterCode(filteredClusters[0].splitterCode);
      }
    }
  }, [filteredClusters, activeSplitterCode]);

  const getAttenuationMeta = useCallback((att: number | undefined): AttenuationMeta => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', tone: 'neutral', badge: 'badge gray', status: 'neutral' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return {
        label: `${att.toFixed(1)} dBm (Normal)`,
        tone: 'normal',
        badge: 'badge green',
        status: 'normal',
      };
    }
    if (att < -22.0 && att >= -25.0) {
      return {
        label: `${att.toFixed(1)} dBm (Warning)`,
        tone: 'warning',
        badge: 'badge yellow',
        status: 'warning',
      };
    }
    return {
      label: `${att.toFixed(1)} dBm (Critical)`,
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
        const res = await fetch(`/api/v1/admin/clusters/history?${query.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !json?.success || !Array.isArray(json.data)) {
          notifyApiResponseError(
            res.status,
            json,
            'Gagal memuat riwayat ODP dari PostgreSQL',
            { category: 'database', source: '/api/v1/admin/clusters/history' },
          );
          setOdpHistoryLogs([]);
          return;
        }

        const mapped: OdpHistoryLogItem[] = (json.data as OdpHistoryEntry[]).map((entry) => {
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
            notes: entry.notes || 'Pengukuran redaman optik tercatat atomik di PostgreSQL.',
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
      const res = await fetch('/api/v1/admin/clusters/audit', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal menjalankan audit integritas jaringan di PostgreSQL',
          { category: 'database', source: '/api/v1/admin/clusters/audit' },
        );
        throw new Error(parsed.message);
      }

      const result = json.data as NetworkAuditResult;
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
          `Audit selesai: ${result.totalSplitters} ODP tervalidasi sehat (${result.usedPorts}/${result.totalPorts} port terisi, 0 collision).`,
        );
      } else {
        showSuccess(
          `Audit selesai: ditemukan ${result.findings.length} temuan kapasitas/redaman/geofence dari ${result.totalSplitters} ODP.`,
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
    const res = await fetch('/api/v1/admin/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, entityType: 'CLUSTER' }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;
    if (!res.ok || !json?.success) {
      const parsed = notifyApiResponseError(
        res.status,
        json,
        'Gagal menambahkan wilayah cluster',
        { category: 'database', source: CLUSTERS_CACHE_KEY },
      );
      throw new Error(parsed.message);
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY);
    showSuccess(`Cluster ${payload.name} (${payload.clusterCode}) berhasil ditambahkan.`);
    await fetchClusters(true);
  };

  const handleCreateSplitter = async (
    payload: import('@repo/shared').CreateSplitterInput,
  ) => {
    const res = await fetch('/api/v1/admin/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, entityType: 'SPLITTER' }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;
    if (!res.ok || !json?.success) {
      const parsed = notifyApiResponseError(
        res.status,
        json,
        'Gagal menambahkan ODP splitter',
        { category: 'database', source: CLUSTERS_CACHE_KEY },
      );
      throw new Error(parsed.message);
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY);
    showSuccess(`ODP ${payload.splitterCode} (${payload.maxPorts} port) berhasil ditambahkan.`);
    setActiveSplitterCode(payload.splitterCode);
    await fetchClusters(true);
  };

  const handleUpdateSplitter = async (
    payload: import('@repo/shared').UpdateSplitterInput,
  ) => {
    const res = await fetch('/api/v1/admin/clusters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;
    if (!res.ok || !json?.success) {
      const parsed = notifyApiResponseError(
        res.status,
        json,
        'Gagal memperbarui ODP splitter',
        { category: 'database', source: CLUSTERS_CACHE_KEY },
      );
      throw new Error(parsed.message);
    }
    invalidateQueryCache(CLUSTERS_CACHE_KEY, CLUSTER_OPTIONS_CACHE_KEY);
    showSuccess(`Data ODP ${payload.splitterCode} berhasil diperbarui.`);
    await fetchClusters(true);
  };

  return {
    search,
    setSearch,
    clusterFilter,
    setClusterFilter,
    portStatusFilter,
    setPortStatusFilter,
    activeSplitterCode,
    setActiveSplitterCode,
    expandedClusters,
    toggleClusterExpand,
    networkData,
    loading,
    selectedPort,
    handlePortClick,
    portFilter,
    setPortFilter,
    activeTab,
    setActiveTab,
    expandedPortNum,
    setExpandedPortNum,
    selectedCustomerForModal,
    setSelectedCustomerForModal,
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
