'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CreateTicketInput, DbTicketPendingSubmission } from '@repo/shared';
import { useAuth, useToast } from '@/providers';

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
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { canCreateTicket } = useAuth();
  const { showError, showSuccess } = useToast();

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/tickets');
      const json = await res.json();
      if (json.success && json.data) {
        setTickets(json.data);
      }
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (data: CreateTicketInput) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    showSuccess(`Tiket ${data.ticketType} untuk ${data.customerName} berhasil dibuat.`);
    await fetchTickets();
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
        await fetchTickets();
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

