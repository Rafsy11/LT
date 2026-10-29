'use client';

import { useState, useEffect } from 'react';
import { useAuth, useToast } from '@/providers';
import type { DbTicket } from '@repo/shared';

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
  const [tickets, setTickets] = useState<DbTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<DbTicket | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [techStats, setTechStats] = useState<{ total: number; active: number } | null>(null);
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

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/v1/admin/tickets');
      const json = await res.json();
      if (json.success) {
        setTickets(json.data);
      }
    } catch (e: unknown) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();

    const fetchStats = async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          fetch('/api/v1/admin/customers').then((r) => r.json()).catch(() => null),
          fetch('/api/v1/admin/technicians').then((r) => r.json()).catch(() => null),
        ]);
        if (cRes?.success && Array.isArray(cRes.data)) {
          setCustomerCount(cRes.data.length);
        }
        if (tRes?.success && Array.isArray(tRes.data)) {
          const active = tRes.data.filter(
            (tk: any) => tk.hasActiveSession || tk.sessionActive || tk.status === 'BUSY' || tk.status === 'AVAILABLE'
          ).length;
          setTechStats({ total: tRes.data.length, active: active || tRes.data.length });
        }
      } catch {}
    };
    fetchStats();

    const updateClock = () => {
      const now = new Date();
      setCurrentDateTime({
        date: now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      });
    };
    updateClock();
    const interval = setInterval(updateClock, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleCreateTicket = async (data: any) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    fetchTickets();
  };

  const handleMarkCompleted = async (ticketNumber: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketNumber === ticketNumber ? { ...t, status: 'Selesai' } : t))
    );
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesCluster = cluster === 'Semua cluster' || t.cluster === cluster;
    const matchesStatus =
      statusFilter === 'Semua' ||
      (statusFilter === 'Menunggu' && (t.status === 'Menunggu' || t.status === 'Menunggu verifikasi')) ||
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
          ].join(',')
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

  const activeTicketsCount = tickets.filter((t) => t.status !== 'Selesai' && t.status !== 'Dibatalkan').length;
  const waitingTicketsCount = tickets.filter((t) => t.status === 'Menunggu' || t.status === 'Menunggu verifikasi').length;
  const normalAttenuationCount = tickets.filter(
    (t) => typeof t.currentAttenuation === 'number' && t.currentAttenuation >= -22 && t.currentAttenuation <= -15
  ).length;
  const networkHealthPct = tickets.length > 0 ? Math.round((normalAttenuationCount / tickets.length) * 100) : 98;

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
    fetchTickets,
    handleCreateTicket,
    handleMarkCompleted,
    exportCsv,
  };
}

