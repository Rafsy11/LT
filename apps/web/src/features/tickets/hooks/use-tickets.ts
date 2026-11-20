'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CreateTicketInput, DbTicket } from '@repo/shared';
import { STANDARD_ERROR_MESSAGES } from '@repo/shared';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { useAuth, useToast } from '@/providers';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';

const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';

export type TicketItem = DbTicket;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { canCreateTicket } = useAuth();
  const { showError, showSuccess } = useToast();

  const fetchTickets = useCallback(
    async (force = false) => {
      try {
        setLoadError(null);
        if (!getCachedData<TicketItem[]>(TICKETS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<TicketItem[]>(
          TICKETS_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<TicketItem[]>(TICKETS_CACHE_KEY);
            if (!json.success || !Array.isArray(json.data)) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
              });
            }
            return json.data;
          },
          { force },
        );
        setTickets(data);
      } catch (err) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
        });
        setLoadError(normalized.message);
        showError(normalized, {
          onRetry:
            normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
              ? () => void fetchTickets(true)
              : undefined,
        });
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (data: CreateTicketInput) => {
    const json = await webApiClient.post(TICKETS_CACHE_KEY, data);
    if (!json.success) {
      throw normalizeAppError(json.error, {
        fallbackMessage: 'Tiket gangguan baru belum dapat dibuat saat ini.',
      });
    }
    showSuccess(`Tiket ${data.ticketType} untuk ${data.customerName} berhasil dibuat.`);
    invalidateQueryCache(TICKETS_CACHE_KEY, OVERVIEW_CACHE_KEY);
    await fetchTickets(true);
  };

  const handleSimulateSubmission = async () => {
    try {
      setSimulating(true);
      const json = await webApiClient.post('/api/v1/admin/tickets/simulate-submission', {});
      if (json.success) {
        showSuccess('Data hasil ukur teknisi mobile berhasil diterima untuk diverifikasi.');
        invalidateQueryCache(TICKETS_CACHE_KEY, OVERVIEW_CACHE_KEY);
        await fetchTickets(true);
        setTab('Semua');
      } else {
        showError(json.error, {
          fallbackMessage: 'Simulasi laporan teknisi belum dapat diproses.',
        });
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
      r.assignedTech.toLowerCase().includes(search.toLowerCase()) ||
      (r.vendorName || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.locationPlace || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.serviceAddress || '').toLowerCase().includes(search.toLowerCase());
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
    loadError,
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
