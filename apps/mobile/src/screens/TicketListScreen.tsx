import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../api/client';
import { offlineQueue, OfflineTicketSubmission } from '../sync/offlineQueue';

export interface MobileTicketItem {
  id: string;
  ticketNumber: string;
  ticketType: 'PSB' | 'MAINTENANCE';
  status: 'OPEN' | 'IN_PROGRESS';
  adminNotes: string | null;
  assignedAt: string | null;
  createdAt: string;
  customer: {
    id: string;
    siaNumber: string;
    fullName: string;
    address: string;
    lat: number | null;
    lng: number | null;
    currentAttenuation: number | null;
    clusterName: string;
    clusterCode: string;
    splitterCode: string | null;
    portNumber: number | null;
  };
}

export interface SplitterItem {
  id: string;
  splitterCode: string;
  clusterName: string;
  clusterCode: string;
  lat: number;
  lng: number;
  maxPorts: number;
  occupiedPorts: number[];
  availablePorts: number[];
}

export interface TicketListScreenProps {
  apiClient: ApiClient;
  onSelectTicket: (ticket: MobileTicketItem, splitters: SplitterItem[]) => void;
  onLogout: () => void;
}

export function TicketListScreen({
  apiClient,
  onSelectTicket,
  onLogout,
}: TicketListScreenProps) {
  const [tickets, setTickets] = useState<MobileTicketItem[]>([]);
  const [splitters, setSplitters] = useState<SplitterItem[]>([]);
  const [offlineItems, setOfflineItems] = useState<OfflineTicketSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'PSB' | 'MAINTENANCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refreshOfflineQueue = useCallback(async () => {
    const queue = await offlineQueue.getQueue();
    setOfflineItems(queue);
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.request<{
        tickets: MobileTicketItem[];
        splitters: SplitterItem[];
      }>('/api/v1/tech/tickets');

      if (res.success && res.data) {
        setTickets(res.data.tickets || []);
        setSplitters(res.data.splitters || []);
      } else if (!res.success) {
        setError(res.error.message || 'Gagal memuat tiket.');
      }
    } catch (err) {
      setError((err as Error).message || 'Gagal tersambung ke server.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchTickets();
    refreshOfflineQueue();
  }, [fetchTickets, refreshOfflineQueue]);

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      const res = await offlineQueue.flush();
      await refreshOfflineQueue();
      await fetchTickets();
      return res;
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filterType !== 'ALL' && t.ticketType !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = t.ticketNumber.toLowerCase().includes(q);
      const matchName = t.customer.fullName.toLowerCase().includes(q);
      const matchSia = t.customer.siaNumber.toLowerCase().includes(q);
      const matchAddr = t.customer.address.toLowerCase().includes(q);
      return matchNum || matchName || matchSia || matchAddr;
    }
    return true;
  });

  return {
    state: {
      tickets: filteredTickets,
      totalTicketsCount: tickets.length,
      splitters,
      offlineQueueCount: offlineItems.length,
      offlineQueue: offlineItems,
      isLoading,
      isSyncing,
      filterType,
      searchQuery,
      error,
    },
    actions: {
      setFilterType,
      setSearchQuery,
      refresh: fetchTickets,
      syncOfflineQueue: handleManualSync,
      selectTicket: (ticket: MobileTicketItem) => onSelectTicket(ticket, splitters),
      logout: onLogout,
    },
  };
}
