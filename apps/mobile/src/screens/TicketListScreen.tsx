import { useState, useEffect, useCallback } from 'react';
import { PALEMBANG_ODP_LIST } from '@repo/shared';
import { ApiClient } from '../api/client';
import { offlineQueue, OfflineTicketSubmission } from '../sync/offlineQueue';
import { getEncryptedItem, setEncryptedItem } from '../storage/persistentStorage';
import { getThemeTokens } from '../theme/tokens';

const STORAGE_KEY_CACHED_TICKETS = '@fiberops_cached_tickets_v1';
const STORAGE_KEY_CACHED_ODPS = '@fiberops_cached_odps_v1';

export interface MobileTicketItem {
  id: string;
  ticketNumber: string;
  ticketType: 'PSB' | 'MAINTENANCE';
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL';
  vendorName?: string | null;
  complaintSummary?: string | null;
  customerPhone?: string | null;
  serviceAddress?: string;
  locationPlace?: string | null;
  targetLat?: number | null;
  targetLng?: number | null;
  adminNotes: string | null;
  rejectionReason?: string | null;
  assignedAt: string | null;
  startedAt?: string | null;
  createdAt: string;
  customer: {
    id: string;
    siaNumber: string;
    fullName: string;
    address: string;
    lat: number | null;
    lng: number | null;
    currentAttenuation: number | null;
    attenuationHistory?: number[];
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
  technicianName?: string;
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
}

export function TicketListScreen({ apiClient, onSelectTicket, onLogout }: TicketListScreenProps) {
  const [tickets, setTickets] = useState<MobileTicketItem[]>([]);
  const [splitters, setSplitters] = useState<SplitterItem[]>(PALEMBANG_ODP_LIST);
  const [offlineItems, setOfflineItems] = useState<OfflineTicketSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'PSB' | 'MAINTENANCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadLocalCache = useCallback(async () => {
    try {
      const cachedOdps = await getEncryptedItem<SplitterItem[]>(STORAGE_KEY_CACHED_ODPS);
      if (cachedOdps && cachedOdps.length > 0) {
        setSplitters(cachedOdps);
      } else {
        setSplitters(PALEMBANG_ODP_LIST);
        await setEncryptedItem(STORAGE_KEY_CACHED_ODPS, PALEMBANG_ODP_LIST);
      }

      const cachedTickets = await getEncryptedItem<MobileTicketItem[]>(STORAGE_KEY_CACHED_TICKETS);
      if (cachedTickets && cachedTickets.length > 0) {
        setTickets(cachedTickets);
      }
    } catch (err) {
      console.warn('[TicketListScreen] Failed loading local cache:', err);
    }
  }, []);

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
        const remoteTickets = res.data.tickets || [];
        const remoteSplitters =
          res.data.splitters && res.data.splitters.length > 0
            ? res.data.splitters
            : PALEMBANG_ODP_LIST;

        setTickets(remoteTickets);
        setSplitters(remoteSplitters);

        await setEncryptedItem(STORAGE_KEY_CACHED_TICKETS, remoteTickets);
        await setEncryptedItem(STORAGE_KEY_CACHED_ODPS, remoteSplitters);
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
    loadLocalCache();
    fetchTickets();
    refreshOfflineQueue();
  }, [loadLocalCache, fetchTickets, refreshOfflineQueue]);

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

  const handleStartExecution = async (
    ticketId: string,
    coords?: { latitude: number; longitude: number },
  ) => {
    setError(null);
    const res = await apiClient.request<unknown>(`/api/v1/tech/tickets/${ticketId}/start`, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'MOBILE',
        checkInLat: coords?.latitude,
        checkInLng: coords?.longitude,
      }),
    });
    if (!res.success) {
      setError(res.error.message || 'Gagal memulai eksekusi lapangan.');
      throw new Error(res.error.message || 'Gagal memulai eksekusi lapangan.');
    }
    await fetchTickets();
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
      const matchAddr = (t.serviceAddress || t.customer.address).toLowerCase().includes(q);
      const matchPlace = (t.locationPlace || '').toLowerCase().includes(q);
      const matchComplaint = (t.complaintSummary || '').toLowerCase().includes(q);
      return matchNum || matchName || matchSia || matchAddr || matchPlace || matchComplaint;
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
      startExecution: handleStartExecution,
      selectTicket: (ticket: MobileTicketItem) => onSelectTicket(ticket, splitters),
      logout: onLogout,
    },
  };
}

/**
 * Interactive Field Technician Ticket Dashboard View.
 * Implements outdoor-readable contrast, 44px touch targets, and 4px-8px geometry.
 */
export function TicketListView(props: TicketListScreenProps) {
  const { state, actions } = TicketListScreen(props);
  const theme = getThemeTokens(props.themeMode || 'light');

  const psbCount = state.tickets.filter((t) => t.ticketType === 'PSB').length;
  const mtCount = state.tickets.filter((t) => t.ticketType === 'MAINTENANCE').length;

  return (
    <div
      style={{
        maxWidth: '520px',
        margin: '0 auto',
        padding: '16px',
        color: theme.textPrimary,
        fontFamily: theme.typography.fontFamily.sans,
      }}
    >
      {/* Header Summary Card */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: theme.textPrimary }}>
              Daftar Tiket Lapangan
            </h2>
            <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '4px 0 0' }}>
              Teknisi: {props.technicianName || 'Petugas Lapangan'} | {state.splitters.length} ODP Palembang Siap
            </p>
          </div>
          <button
            type="button"
            onClick={() => void actions.refresh()}
            disabled={state.isLoading}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              background: theme.badgeBg,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: state.isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {state.isLoading ? 'Memuat...' : 'Segarkan'}
          </button>
        </div>

        {/* KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
          }}
        >
          <div
            style={{
              padding: '10px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
            }}
          >
            <div style={{ fontSize: '11px', color: theme.textSecondary }}>Total Aktif</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary }}>
              {state.totalTicketsCount}
            </div>
          </div>
          <div
            style={{
              padding: '10px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
            }}
          >
            <div style={{ fontSize: '11px', color: theme.textSecondary }}>Pasang Baru</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: theme.primary }}>
              {psbCount}
            </div>
          </div>
          <div
            style={{
              padding: '10px',
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
            }}
          >
            <div style={{ fontSize: '11px', color: theme.textSecondary }}>Gangguan</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#D97706' }}>{mtCount}</div>
          </div>
        </div>
      </div>

      {/* Sticky Offline Queue Sync Banner */}
      {state.offlineQueueCount > 0 && (
        <div
          role="status"
          style={{
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400E' }}>
              Antrean Offline Tersimpan ({state.offlineQueueCount} Laporan)
            </div>
            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
              Data terenkripsi siap dikirim saat sinyal stabil.
            </div>
          </div>
          <button
            type="button"
            disabled={state.isSyncing}
            onClick={() => void actions.syncOfflineQueue()}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              background: '#D97706',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: state.isSyncing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {state.isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Sekarang'}
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '14px',
        }}
      >
        <input
          type="search"
          value={state.searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          placeholder="Cari No. Tiket, Nama Pelanggan, SIA, atau Lokasi..."
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '10px 12px',
            fontSize: '13px',
            background: theme.bg,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            boxSizing: 'border-box',
            marginBottom: '10px',
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {(['ALL', 'PSB', 'MAINTENANCE'] as const).map((tab) => {
            const isActive = state.filterType === tab;
            const label = tab === 'ALL' ? 'Semua' : tab === 'PSB' ? 'PSB' : 'Maintenance';
            return (
              <button
                key={tab}
                type="button"
                onClick={() => actions.setFilterType(tab)}
                style={{
                  minHeight: '44px',
                  padding: '8px 10px',
                  background: isActive ? theme.primary : theme.bg,
                  color: isActive ? '#FFFFFF' : theme.textPrimary,
                  border: `1px solid ${isActive ? theme.primary : theme.border}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error / Offline Cache Notice */}
      {state.error && (
        <div
          role="alert"
          style={{
            padding: '12px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            color: '#991B1B',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          <strong>Peringatan Koneksi:</strong> {state.error} (Menampilkan cache lokal terenkripsi & {state.splitters.length} ODP Palembang).
        </div>
      )}

      {/* Ticket List Cards */}
      {state.isLoading && state.tickets.length === 0 ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: theme.textSecondary,
            fontSize: '13px',
          }}
        >
          Memuat antrean tiket penugasan teknisi...
        </div>
      ) : state.tickets.length === 0 ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: theme.textSecondary,
            fontSize: '13px',
          }}
        >
          Tidak ada tiket lapangan yang sesuai dengan filter pencarian saat ini.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {state.tickets.map((ticket) => {
            const targetLat = ticket.targetLat ?? ticket.customer.lat;
            const targetLng = ticket.targetLng ?? ticket.customer.lng;
            const mapsUrl =
              targetLat !== null && targetLng !== null
                ? `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    ticket.serviceAddress || ticket.customer.address,
                  )}`;

            return (
              <div
                key={ticket.id}
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                {/* Top Badge Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.typography.fontFamily.mono,
                      fontSize: '13px',
                      fontWeight: 700,
                      color: theme.textPrimary,
                    }}
                  >
                    {ticket.ticketNumber}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: ticket.ticketType === 'PSB' ? '#E0F2FE' : '#FEF3C7',
                        color: ticket.ticketType === 'PSB' ? '#0369A1' : '#92400E',
                      }}
                    >
                      {ticket.ticketType}
                    </span>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: ticket.status === 'IN_PROGRESS' ? '#DCFCE7' : theme.badgeBg,
                        color: ticket.status === 'IN_PROGRESS' ? '#166534' : theme.textSecondary,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      {ticket.status}
                    </span>
                  </div>
                </div>

                {/* NOC Rejection Banner if ticket was returned for revision */}
                {ticket.rejectionReason && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '6px',
                      color: '#991B1B',
                      fontSize: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    <strong>Revisi NOC:</strong> {ticket.rejectionReason}
                  </div>
                )}

                <div style={{ fontSize: '15px', fontWeight: 700, color: theme.textPrimary }}>
                  {ticket.customer.fullName}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: theme.textSecondary,
                    fontFamily: theme.typography.fontFamily.mono,
                    marginTop: '2px',
                  }}
                >
                  SIA: {ticket.customer.siaNumber} | ODP: {ticket.customer.splitterCode || 'ODP-PLB-001'}
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: theme.textSecondary,
                    marginTop: '8px',
                    lineHeight: 1.5,
                  }}
                >
                  {ticket.serviceAddress || ticket.customer.address}
                </div>

                {ticket.complaintSummary && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: theme.textPrimary,
                    }}
                  >
                    <strong>Keluhan / Catatan:</strong> {ticket.complaintSummary}
                  </div>
                )}

                {/* Action Row: Maps Route & Execute/Submit */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      minHeight: '44px',
                      padding: '10px 12px',
                      background: theme.bg,
                      color: theme.textPrimary,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    Rute Peta ODP
                  </a>

                  <button
                    type="button"
                    onClick={() => actions.selectTicket(ticket)}
                    style={{
                      minHeight: '44px',
                      padding: '10px 12px',
                      background: theme.primary,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {ticket.status === 'OPEN' ? 'Mulai & Ukur OPM' : 'Isi Laporan OPM'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
