'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useToast } from '@/providers';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { clearServiceUnavailable, notifyApiResponseError } from '@/lib/api-error';
import {
  PERMISSIONS,
  type ClusterListItem,
  type DbTicket,
  type NetworkStats,
} from '@repo/shared';
import {
  fetchWithCache,
  getCachedData,
  invalidateQueryCache,
  setCachedData,
} from '@/lib/query-cache';

const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';
const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const CLUSTERS_MAP_CACHE_KEY = '/api/v1/admin/clusters';

interface OverviewPayload {
  tickets: DbTicket[];
  stats: {
    customerCount: number;
    technicianTotal: number;
    technicianActive: number;
  };
}

interface TopologyPayload {
  clusters: ClusterListItem[];
  stats: NetworkStats;
}

export interface OverviewFeedItem {
  id: string;
  title: string;
  clusterLine?: string;
  customerLine?: string;
  tag?: string;
  tagType?: string;
  timeAgo: string;
  type: 'critical' | 'warning' | 'success' | 'info';
  customerName?: string;
  siaNumber?: string;
  cluster?: string;
  techName?: string;
  attenuation?: number;
  isUnread?: boolean;
}

export function useOverview() {
  const [cluster, setCluster] = useState('Semua cluster');
  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState<DbTicket[]>(
    () =>
      getCachedData<OverviewPayload>(OVERVIEW_CACHE_KEY)?.tickets ??
      getCachedData<DbTicket[]>(TICKETS_CACHE_KEY) ??
      [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<OverviewPayload>(OVERVIEW_CACHE_KEY),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<DbTicket | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(
    () => getCachedData<OverviewPayload>(OVERVIEW_CACHE_KEY)?.stats.customerCount ?? null,
  );
  const [techStats, setTechStats] = useState<{ total: number; active: number } | null>(() => {
    const cachedStats = getCachedData<OverviewPayload>(OVERVIEW_CACHE_KEY)?.stats;
    return cachedStats
      ? { total: cachedStats.technicianTotal, active: cachedStats.technicianActive }
      : null;
  });
  const [currentDateTime, setCurrentDateTime] = useState({ date: '', time: '' });
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [topologyClusters, setTopologyClusters] = useState<ClusterListItem[]>(
    () => getCachedData<TopologyPayload>(CLUSTERS_MAP_CACHE_KEY)?.clusters ?? [],
  );
  const [mapLoading, setMapLoading] = useState<boolean>(
    () => !getCachedData<TopologyPayload>(CLUSTERS_MAP_CACHE_KEY),
  );

  const { canCreateTicket, hasPermission, user } = useAuth();
  const { showError } = useToast();
  const { clusters: clusterOptions } = useClusterOptions();
  const canReadNetwork = hasPermission(PERMISSIONS.NETWORK_READ);

  const feedItems = useMemo<OverviewFeedItem[]>(() => {
    const sorted = [...tickets].sort((a, b) => {
      const aTime =
        new Date(a.completedAt || a.dispatchedAt || a.startedAt || a.createdAt).getTime() || 0;
      const bTime =
        new Date(b.completedAt || b.dispatchedAt || b.startedAt || b.createdAt).getTime() || 0;
      return bTime - aTime;
    });

    return sorted.slice(0, 4).map((t) => {
      const eventIso = t.completedAt || t.dispatchedAt || t.startedAt || t.createdAt;
      const eventDate = new Date(eventIso);
      const timeAgo = Number.isNaN(eventDate.getTime())
        ? '--:--'
        : eventDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      const isCriticalAttenuation =
        typeof t.currentAttenuation === 'number' &&
        t.currentAttenuation !== 0 &&
        t.currentAttenuation < -24;

      let type: OverviewFeedItem['type'] = 'info';
      let title = `${t.ticketNumber} · Menunggu Penugasan`;
      let tag: string = t.ticketType;

      if (t.status === 'Menunggu verifikasi') {
        type = 'warning';
        title = `${t.ticketNumber} · Verifikasi Laporan`;
        tag = 'Verifikasi Lintasarta';
      } else if (t.status === 'Selesai') {
        type = 'success';
        title = `${t.ticketNumber} · Selesai Ditangani`;
        tag = 'Selesai';
      } else if (t.status === 'Dibatalkan') {
        type = 'info';
        title = `${t.ticketNumber} · Dibatalkan`;
        tag = 'Dibatalkan';
      } else if (t.isLocationFlagged || isCriticalAttenuation) {
        type = 'critical';
        title = t.isLocationFlagged
          ? `${t.ticketNumber} · Anomali Lokasi`
          : `${t.ticketNumber} · Redaman Kritis (${t.currentAttenuation} dBm)`;
        tag = 'Prioritas';
      } else if (t.status === 'Dalam proses') {
        type = 'warning';
        title = `${t.ticketNumber} · Sedang Dikerjakan`;
        tag = 'Lapangan';
      }

      const techLabel = t.assignedTech ? `Teknisi: ${t.assignedTech}` : 'Belum ditugaskan';
      return {
        id: t.id,
        title,
        clusterLine: t.splitterCode ? `${t.cluster} · ${t.splitterCode}` : t.cluster,
        customerLine: `${t.customerName} · ${techLabel}`,
        tag,
        tagType: type,
        timeAgo,
        type,
        customerName: t.customerName,
        siaNumber: t.siaNumber,
        cluster: t.cluster,
        techName: t.assignedTech,
        attenuation: t.currentAttenuation,
      };
    });
  }, [tickets]);

  const fetchOverview = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<OverviewPayload>(OVERVIEW_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<OverviewPayload>(
          OVERVIEW_CACHE_KEY,
          async () => {
            const res = await fetch(OVERVIEW_CACHE_KEY);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success || !json.data) {
              const parsed = notifyApiResponseError(
                res.status,
                json,
                'Gagal memuat ringkasan operasional',
                { category: 'database', source: OVERVIEW_CACHE_KEY },
              );
              throw new Error(parsed.message);
            }
            clearServiceUnavailable('database');
            return json.data as OverviewPayload;
          },
          { force },
        );

        setTickets(data.tickets);
        setCustomerCount(data.stats.customerCount);
        setTechStats({
          total: data.stats.technicianTotal,
          active: data.stats.technicianActive,
        });
        setCachedData(TICKETS_CACHE_KEY, data.tickets);
      } catch (e: unknown) {
        showError(e);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  const fetchTopologyClusters = useCallback(
    async (force = false) => {
      if (!canReadNetwork) {
        setMapLoading(false);
        return;
      }
      try {
        if (!getCachedData<TopologyPayload>(CLUSTERS_MAP_CACHE_KEY)) {
          setMapLoading(true);
        }
        const payload = await fetchWithCache<TopologyPayload>(
          CLUSTERS_MAP_CACHE_KEY,
          async () => {
            const res = await fetch(CLUSTERS_MAP_CACHE_KEY);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success || !json.data) {
              const parsed = notifyApiResponseError(
                res.status,
                json,
                'Gagal memuat data topologi jaringan',
                { category: 'database', source: CLUSTERS_MAP_CACHE_KEY },
              );
              throw new Error(parsed.message);
            }
            clearServiceUnavailable('database');
            return json.data as TopologyPayload;
          },
          { force },
        );

        setTopologyClusters(Array.isArray(payload.clusters) ? payload.clusters : []);
      } catch {
        // Outage or permission state handled via ConnectionBanner / ClusterOption fallback
      } finally {
        setMapLoading(false);
      }
    },
    [canReadNetwork],
  );

  useEffect(() => {
    void fetchOverview();
    void fetchTopologyClusters();

    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime({
        date: now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      });
    };
    updateClock();
    const interval = setInterval(updateClock, 60000);

    return () => clearInterval(interval);
  }, [fetchOverview, fetchTopologyClusters]);

  const handleCreateTicket = async (data: import('@repo/shared').CreateTicketInput) => {
    const res = await fetch(TICKETS_CACHE_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      const parsed = notifyApiResponseError(
        res.status,
        json,
        'Gagal membuat tiket baru',
        { category: 'database', source: TICKETS_CACHE_KEY },
      );
      throw json?.error || new Error(parsed.message);
    }
    invalidateQueryCache(OVERVIEW_CACHE_KEY, TICKETS_CACHE_KEY);
    await fetchOverview(true);
  };

  const refreshAllOverview = useCallback(
    async (force = false) => {
      await Promise.all([fetchOverview(force), fetchTopologyClusters(force)]);
    },
    [fetchOverview, fetchTopologyClusters],
  );

  const filteredTickets = tickets.filter((t) => {
    const matchesCluster =
      cluster === 'Semua cluster' ||
      t.cluster === cluster ||
      t.clusterCode === cluster;
    const matchesStatus =
      statusFilter === 'Semua' ||
      (statusFilter === 'Menunggu' &&
        (t.status === 'Menunggu' || t.status === 'Menunggu verifikasi')) ||
      (statusFilter === 'Dalam proses' && t.status === 'Menunggu verifikasi') ||
      (statusFilter === 'Selesai' && t.status === 'Selesai');
    const matchesQuery =
      query === '' ||
      t.ticketNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.customerName.toLowerCase().includes(query.toLowerCase()) ||
      t.siaNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.cluster.toLowerCase().includes(query.toLowerCase()) ||
      t.assignedTech.toLowerCase().includes(query.toLowerCase());
    return matchesCluster && matchesStatus && matchesQuery;
  });

  const exportCsv = () => {
    const csvContent =
      'Tiket,Pelanggan,Nomor SIA,Tipe Pekerjaan,Cluster,Teknisi,Status,Redaman (dBm)\n' +
      filteredTickets
        .map((r) =>
          [
            r.ticketNumber,
            `"${r.customerName}"`,
            r.siaNumber,
            r.ticketType,
            r.cluster,
            r.assignedTech,
            r.status,
            r.currentAttenuation,
          ].join(','),
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-operasional-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeTicketsCount = tickets.filter(
    (t) => t.status !== 'Selesai' && t.status !== 'Dibatalkan',
  ).length;
  const waitingTicketsCount = tickets.filter(
    (t) => t.status === 'Menunggu' || t.status === 'Menunggu verifikasi',
  ).length;
  const normalAttenuationCount = tickets.filter(
    (t) =>
      typeof t.currentAttenuation === 'number' &&
      t.currentAttenuation >= -22 &&
      t.currentAttenuation <= -15,
  ).length;
  const networkHealthPct: number | null =
    tickets.length > 0 ? Math.round((normalAttenuationCount / tickets.length) * 100) : null;

  return {
    cluster,
    setCluster,
    clusterOptions,
    topologyClusters,
    mapLoading,
    query,
    setQuery,
    tickets,
    loading,
    modalOpen,
    setModalOpen,
    selectedTicket,
    setSelectedTicket,
    customerCount,
    techStats,
    currentDateTime,
    statusFilter,
    setStatusFilter,
    feedItems,
    canCreateTicket,
    user,
    filteredTickets,
    activeTicketsCount,
    waitingTicketsCount,
    networkHealthPct,
    fetchTickets: refreshAllOverview,
    handleCreateTicket,
    exportCsv,
  };
}
