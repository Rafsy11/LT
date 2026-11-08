'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CreateTicketInput, DbTicketPendingSubmission } from '@repo/shared';
import { useAuth, useToast } from '@/providers';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';

const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';

export interface TicketItem {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: string;
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  pendingSubmission?: DbTicketPendingSubmission;
}

export function useTickets() {
  const [tab, setTab] = useState('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [typeFilter, setTypeFilter] = useState('Semua tipe');
  const [tickets, setTickets] = useState<TicketItem[]>(
    () => getCachedData<TicketItem[]>(TICKETS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<TicketItem[]>(TICKETS_CACHE_KEY),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { canCreateTicket } = useAuth();
  const { showError, showSuccess } = useToast();

  const fetchTickets = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<TicketItem[]>(TICKETS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<TicketItem[]>(
          TICKETS_CACHE_KEY,
          async () => {
            const res = await fetch(TICKETS_CACHE_KEY);
            const json = await res.json();
            if (!res.ok || !json.success || !Array.isArray(json.data)) {
              throw new Error(json.error?.message || 'Gagal memuat daftar tiket');
            }
            return json.data as TicketItem[];
          },
          { force },
        );
        setTickets(data);
      } catch (err) {
        showError(err);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (data: CreateTicketInput) => {
    const res = await fetch(TICKETS_CACHE_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    showSuccess(`Tiket ${data.ticketType} untuk ${data.customerName} berhasil dibuat.`);
    invalidateQueryCache(TICKETS_CACHE_KEY, OVERVIEW_CACHE_KEY);
    await fetchTickets(true);
  };

  const handleSimulateSubmission = async () => {
    try {
      setSimulating(true);
      const res = await fetch('/api/v1/admin/tickets/simulate-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        showSuccess('Data hasil ukur teknisi mobile berhasil diterima untuk diverifikasi.');
        invalidateQueryCache(TICKETS_CACHE_KEY, OVERVIEW_CACHE_KEY);
        await fetchTickets(true);
        setTab('Semua');
      } else {
        showError(json.error || 'Gagal mensimulasikan data teknisi.');
      }
    } catch (err) {
      showError(err);
    } finally {
      setSimulating(false);
    }
  };

  const scoped = tickets.filter((r) => {
    const matchesCluster =
      cluster === 'Semua cluster' ||
      r.cluster.toLowerCase().includes(cluster.replace('Bandung ', '').toLowerCase());
    const matchesType =
      typeFilter === 'Semua tipe' || r.ticketType.toLowerCase().includes(typeFilter.toLowerCase());
    const matchesSearch =
      search.trim() === '' ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.assignedTech.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesType && matchesSearch;
  });

  const filtered = scoped.filter((r) => tab === 'Semua' || r.status === tab);

  const waitingCount = scoped.filter((r) => r.status === 'Menunggu').length;
  const inProgressCount = scoped.filter((r) => r.status === 'Dalam proses').length;

  const getDbmBadge = (att: number | undefined) => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', cls: 'badge gray' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, cls: 'badge green' };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, cls: 'badge yellow' };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, cls: 'badge red' };
  };

  return {
    tab,
    setTab,
    search,
    setSearch,
    cluster,
    setCluster,
    typeFilter,
    setTypeFilter,
    tickets,
    loading,
    modalOpen,
    setModalOpen,
    selectedTicket,
    setSelectedTicket,
    simulating,
    canCreateTicket,
    fetchTickets,
    handleCreateTicket,
    handleSimulateSubmission,
    scoped,
    filtered,
    waitingCount,
    inProgressCount,
    getDbmBadge,
  };
}
