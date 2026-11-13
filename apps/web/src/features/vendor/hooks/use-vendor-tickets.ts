'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DbTicketPendingSubmission, SubmitTicketInput } from '@repo/shared';
import { useToast } from '@/providers';
import {
  fetchWithCache,
  getCachedData,
  setCachedData,
  invalidateQueryCache,
} from '@/lib/query-cache';

const TECH_TICKETS_ENDPOINT = '/api/v1/tech/tickets';

export interface VendorTicketDto {
  id: string;
  ticketNumber: string;
  ticketType: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | string;
  vendorName: string | null;
  complaintSummary: string | null;
  customerPhone: string | null;
  serviceAddress: string;
  locationPlace: string | null;
  targetLat: number | null;
  targetLng: number | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  createdAt: string;
  pendingSubmission: DbTicketPendingSubmission | null;
  customer: {
    id: string;
    siaNumber: string;
    fullName: string;
    address: string;
    lat: number | null;
    lng: number | null;
    currentAttenuation: number | null;
    attenuationHistory: number[];
    clusterName: string;
    clusterCode: string;
    splitterCode: string | null;
    portNumber: number | null;
  };
}

export interface VendorSplitterDto {
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

export type VendorFilterTab = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL';

export function useVendorTickets() {
  const [tickets, setTickets] = useState<VendorTicketDto[]>(
    () => getCachedData<VendorTicketDto[]>(TECH_TICKETS_ENDPOINT) ?? [],
  );
  const [splitters, setSplitters] = useState<VendorSplitterDto[]>([]);
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<VendorTicketDto[]>(TECH_TICKETS_ENDPOINT),
  );
  const [statusFilter, setStatusFilter] = useState<VendorFilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<VendorTicketDto | null>(null);

  const { showError, showSuccess } = useToast();

  const fetchVendorTickets = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<VendorTicketDto[]>(TECH_TICKETS_ENDPOINT)) {
          setLoading(true);
        }

        const res = await fetch(TECH_TICKETS_ENDPOINT, {
          cache: force ? 'no-store' : 'default',
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Gagal memuat daftar tugas vendor');
        }

        const nextTickets = Array.isArray(json.data?.tickets)
          ? (json.data.tickets as VendorTicketDto[])
          : [];
        const nextSplitters = Array.isArray(json.data?.splitters)
          ? (json.data.splitters as VendorSplitterDto[])
          : [];

        setTickets(nextTickets);
        setSplitters(nextSplitters);
        setCachedData(TECH_TICKETS_ENDPOINT, nextTickets);
      } catch (err) {
        showError(err);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchWithCache<VendorTicketDto[]>(
      TECH_TICKETS_ENDPOINT,
      async () => {
        const res = await fetch(TECH_TICKETS_ENDPOINT);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Gagal memuat tugas vendor');
        }
        if (Array.isArray(json.data?.splitters)) {
          setSplitters(json.data.splitters as VendorSplitterDto[]);
        }
        return Array.isArray(json.data?.tickets)
          ? (json.data.tickets as VendorTicketDto[])
          : [];
      },
      { force: true },
    )
      .then((list) => {
        setTickets(list);
      })
      .catch((err) => {
        showError(err);
      })
      .finally(() => {
        setLoading(false);
      });

    const handleRefresh = () => {
      void fetchVendorTickets(true);
    };
    window.addEventListener('app:refresh-data', handleRefresh);
    return () => {
      window.removeEventListener('app:refresh-data', handleRefresh);
    };
  }, [fetchVendorTickets, showError]);

  const startExecution = useCallback(
    async (ticket: VendorTicketDto) => {
      try {
        setStartingId(ticket.id);

        let checkInLat: number | undefined;
        let checkInLng: number | undefined;
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                checkInLat = pos.coords.latitude;
                checkInLng = pos.coords.longitude;
                resolve();
              },
              () => resolve(),
              { timeout: 3000 },
            );
          });
        }

        const res = await fetch(`/api/v1/tech/tickets/${ticket.id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'WEB',
            checkInLat,
            checkInLng,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Gagal memulai pengerjaan di lokasi');
        }

        showSuccess(
          `Eksekusi untuk ${ticket.ticketNumber} (${ticket.customer.fullName}) dimulai.`,
        );
        invalidateQueryCache(TECH_TICKETS_ENDPOINT, '/api/v1/admin/tickets');
        await fetchVendorTickets(true);
      } catch (err) {
        showError(err);
      } finally {
        setStartingId(null);
      }
    },
    [fetchVendorTickets, showError, showSuccess],
  );

  const uploadOpmPhoto = useCallback(async (ticketId: string, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/v1/tech/tickets/${ticketId}/upload`, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    if (!res.ok || !json.success || !json.data?.photoObjectKey) {
      throw new Error(json.error?.message || 'Gagal mengunggah foto OPM');
    }
    return String(json.data.photoObjectKey);
  }, []);

  const submitVendorReport = useCallback(
    async (ticketId: string, payload: SubmitTicketInput) => {
      const res = await fetch(`/api/v1/tech/tickets/${ticketId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': payload.submissionId,
        },
        body: JSON.stringify({ ...payload, channel: 'WEB' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal mengirim laporan ke Pusat Lintasarta');
      }

      showSuccess(
        json.meta?.message ||
          'Laporan hasil terbaru berhasil dikirim ke Pusat Lintasarta untuk verifikasi.',
      );
      invalidateQueryCache(
        TECH_TICKETS_ENDPOINT,
        '/api/v1/admin/tickets',
        '/api/v1/admin/overview',
      );
      await fetchVendorTickets(true);
    },
    [fetchVendorTickets, showSuccess],
  );

  const filteredTickets = tickets.filter((t) => {
    const matchesTab = statusFilter === 'ALL' || t.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.ticketNumber.toLowerCase().includes(q) ||
      t.customer.fullName.toLowerCase().includes(q) ||
      t.customer.siaNumber.toLowerCase().includes(q) ||
      (t.locationPlace || '').toLowerCase().includes(q) ||
      t.serviceAddress.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  return {
    tickets,
    filteredTickets,
    splitters,
    loading,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    startingId,
    selectedTicket,
    setSelectedTicket,
    fetchVendorTickets,
    startExecution,
    uploadOpmPhoto,
    submitVendorReport,
  };
}

