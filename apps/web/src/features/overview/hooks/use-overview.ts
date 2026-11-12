'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useToast } from '@/providers';
import type { DbTicket } from '@repo/shared';
import {
  fetchWithCache,
  getCachedData,
  invalidateQueryCache,
  setCachedData,
} from '@/lib/query-cache';

const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';
const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';

interface OverviewPayload {
  tickets: DbTicket[];
  stats: {
    customerCount: number;
    technicianTotal: number;
    technicianActive: number;
  };
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

  const { canCreateTicket, user } = useAuth();
  const { showError } = useToast();

  const [feedItems, setFeedItems] = useState<OverviewFeedItem[]>([
    {
      id: 'f-1',
      title: 'Gangguan koneksi - Critical',
      clusterLine: 'Cluster Bandung Utara - ODP-017A',
      customerLine: 'Pelanggan: PT. Maju Jaya',
      tag: 'Gangguan Jaringan',
      tagType: 'critical',
      timeAgo: '09:42',
      type: 'critical',
    },
    {
      id: 'f-2',
      title: 'Tiket maintenance ditugaskan',
      clusterLine: 'SLA100245 - Bandung Barat',
      customerLine: 'Teknisi: Fajar Hidayat',
      tag: 'Maintenance',
      tagType: 'warning',
      timeAgo: '09:15',
      type: 'warning',
    },
    {
      id: 'f-3',
      title: 'Pemulihan layanan',
      clusterLine: 'Cluster Cimahi - ODP-003B',
      customerLine: 'Layanan kembali normal',
      tag: 'Jaringan',
      tagType: 'success',
      timeAgo: '08:56',
      type: 'success',
    },
    {
      id: 'f-4',
      title: 'Tiket baru dibuat',
      clusterLine: 'SLA100244 - Rancaekek',
      customerLine: 'Pelanggan: CV. Sinar Abadi',
      tag: 'Helpdesk',
      tagType: 'info',
      timeAgo: '08:32',
      type: 'info',
    },
  ]);

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
            const json = await res.json();
            if (!res.ok || !json.success || !json.data) {
              throw new Error(json.error?.message || 'Gagal memuat ringkasan operasional');
            }
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

  useEffect(() => {
    fetchOverview();

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
  }, [fetchOverview]);

  const handleCreateTicket = async (data: import('@repo/shared').CreateTicketInput) => {
    const res = await fetch(TICKETS_CACHE_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    invalidateQueryCache(OVERVIEW_CACHE_KEY, TICKETS_CACHE_KEY);
    await fetchOverview(true);
  };

  const handleMarkCompleted = async (ticketNumber: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketNumber === ticketNumber ? { ...t, status: 'Selesai' } : t)),
    );
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesCluster = cluster === 'Semua cluster' || t.cluster === cluster;
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
  const networkHealthPct =
    tickets.length > 0 ? Math.round((normalAttenuationCount / tickets.length) * 100) : 98;

  return {
    cluster,
    setCluster,
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
    setFeedItems,
    canCreateTicket,
    user,
    filteredTickets,
    activeTicketsCount,
    waitingTicketsCount,
    networkHealthPct,
    fetchTickets: fetchOverview,
    handleCreateTicket,
    handleMarkCompleted,
    exportCsv,
  };
}
