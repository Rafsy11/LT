'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useToast } from '@/providers';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { webApiClient } from '@/lib/api-client';
import { escapeCsvRowsAsync } from '@/lib/csv';
import { normalizeAppError } from '@/lib/error-normalizer';
import {
  classifyDbm,
  isAttenuationBad,
  PERMISSIONS,
  type DbTicket,
  type OdpMapRadarItem,
  type OdpRadarSummary,
} from '@repo/shared';
import {
  fetchWithCache,
  getCachedData,
  invalidateQueryCache,
  setCachedData,
} from '@/lib/query-cache';

const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';
const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const ODP_RADAR_CACHE_KEY = '/api/v1/admin/maps/odp';

interface OverviewPayload {
  tickets: DbTicket[];
  stats: {
    customerCount: number;
    technicianTotal: number;
    technicianActive: number;
  };
}

interface OdpRadarPayload {
  items: OdpMapRadarItem[];
  summary: OdpRadarSummary;
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
  const [rawRadarItems, setRawRadarItems] = useState<OdpMapRadarItem[]>(
    () => getCachedData<OdpRadarPayload>(ODP_RADAR_CACHE_KEY)?.items ?? [],
  );
  const [radarLoading, setRadarLoading] = useState<boolean>(
    () => !getCachedData<OdpRadarPayload>(ODP_RADAR_CACHE_KEY),
  );
  const [radarError, setRadarError] = useState<string | null>(null);

  const { canCreateTicket, hasPermission, user } = useAuth();
  const { showError } = useToast();
  const { clusters: clusterOptions } = useClusterOptions();
  const canReadNetwork = hasPermission(PERMISSIONS.NETWORK_READ);

  const feedItems = useMemo<OverviewFeedItem[]>(() => {
    const sorted = tickets.toSorted((a, b) => {
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
        classifyDbm(t.currentAttenuation) === 'Critical';

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
            const json = await webApiClient.get<OverviewPayload>(OVERVIEW_CACHE_KEY);
            if (!json.success || !json.data) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: 'Ringkasan operasional belum dapat dimuat saat ini.',
              });
            }
            return json.data;
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
        const normalized = normalizeAppError(e);
        showError(normalized, {
          onRetry:
            normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
              ? () => void fetchOverview(true)
              : undefined,
        });
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  const fetchOdpRadar = useCallback(
    async (force = false) => {
      if (!canReadNetwork) {
        setRadarLoading(false);
        return;
      }
      try {
        setRadarError(null);
        if (!getCachedData<OdpRadarPayload>(ODP_RADAR_CACHE_KEY)) {
          setRadarLoading(true);
        }
        const payload = await fetchWithCache<OdpRadarPayload>(
          ODP_RADAR_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<OdpRadarPayload>(ODP_RADAR_CACHE_KEY);
            if (!json.success || !json.data) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: 'Status radar ODP belum dapat dimuat saat ini.',
              });
            }
            return json.data;
          },
          { force },
        );

        setRawRadarItems(Array.isArray(payload.items) ? payload.items : []);
      } catch (err: unknown) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: 'Status radar ODP belum dapat dimuat saat ini.',
        });
        setRadarError(normalized.message);
      } finally {
        setRadarLoading(false);
      }
    },
    [canReadNetwork],
  );

  useEffect(() => {
    void fetchOverview();
    void fetchOdpRadar();

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
  }, [fetchOverview, fetchOdpRadar]);

  const handleCreateTicket = async (data: import('@repo/shared').CreateTicketInput) => {
    const json = await webApiClient.post(TICKETS_CACHE_KEY, data);
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Tiket baru belum dapat dibuat saat ini.',
      });
    }
    invalidateQueryCache(OVERVIEW_CACHE_KEY, TICKETS_CACHE_KEY, ODP_RADAR_CACHE_KEY);
    await Promise.all([fetchOverview(true), fetchOdpRadar(true)]);
  };

  const refreshAllOverview = useCallback(
    async (force = false) => {
      await Promise.all([fetchOverview(force), fetchOdpRadar(force)]);
    },
    [fetchOverview, fetchOdpRadar],
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

  const exportCsv = async () => {
    const headers = [
      'Tiket',
      'Pelanggan',
      'Nomor SIA',
      'Tipe Pekerjaan',
      'Cluster',
      'Teknisi',
      'Status',
      'Redaman (dBm)',
    ];
    const rows = filteredTickets.map((r) => [
      r.ticketNumber,
      r.customerName,
      r.siaNumber,
      r.ticketType,
      r.cluster,
      r.assignedTech,
      r.status,
      r.currentAttenuation,
    ]);

    const csvContent = await escapeCsvRowsAsync(headers, rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-operasional-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedClusterCode = useMemo(() => {
    if (cluster === 'Semua cluster') return null;
    const matched = clusterOptions.find(
      (opt) => opt.name === cluster || opt.clusterCode === cluster,
    );
    return matched?.clusterCode ?? cluster;
  }, [cluster, clusterOptions]);

  const scopedRadarItems = useMemo(() => {
    if (cluster === 'Semua cluster') return rawRadarItems;
    return rawRadarItems.filter(
      (item) =>
        item.clusterName === cluster ||
        item.clusterCode === cluster ||
        (selectedClusterCode !== null && item.clusterCode === selectedClusterCode),
    );
  }, [rawRadarItems, cluster, selectedClusterCode]);

  const scopedRadarSummary = useMemo<OdpRadarSummary>(() => {
    return {
      totalOdps: scopedRadarItems.length,
      normalCount: scopedRadarItems.filter((i) => i.radarStatus === 'NORMAL').length,
      abnormalCount: scopedRadarItems.filter((i) => i.radarStatus === 'ABNORMAL').length,
      unmeasuredCount: scopedRadarItems.filter((i) => i.radarStatus === 'UNMEASURED').length,
      badAttenuationCustomers: scopedRadarItems.reduce((sum, i) => sum + i.badPortCount, 0),
      mappedCustomers: scopedRadarItems.reduce((sum, i) => sum + i.customers.length, 0),
    };
  }, [scopedRadarItems]);

  const activeTicketsCount = tickets.filter(
    (t) => t.status !== 'Selesai' && t.status !== 'Dibatalkan',
  ).length;
  const waitingTicketsCount = tickets.filter(
    (t) => t.status === 'Menunggu' || t.status === 'Menunggu verifikasi',
  ).length;
  const normalAttenuationCount = tickets.filter(
    (t) =>
      typeof t.currentAttenuation === 'number' &&
      t.currentAttenuation !== 0 &&
      !isAttenuationBad(t.currentAttenuation),
  ).length;
  const measuredOdpCount = scopedRadarSummary.normalCount + scopedRadarSummary.abnormalCount;
  const networkHealthPct: number | null =
    measuredOdpCount > 0
      ? Math.round((scopedRadarSummary.normalCount / measuredOdpCount) * 100)
      : tickets.length > 0
        ? Math.round((normalAttenuationCount / tickets.length) * 100)
        : null;

  return {
    cluster,
    setCluster,
    selectedClusterCode,
    clusterOptions,
    odpRadarItems: scopedRadarItems,
    odpRadarSummary: scopedRadarSummary,
    measuredOdpCount,
    radarLoading,
    radarError,
    canReadNetwork,
    refetchRadar: () => fetchOdpRadar(true),
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
