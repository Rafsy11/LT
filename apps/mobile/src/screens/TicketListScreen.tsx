import React, { useState, useEffect, useCallback } from 'react';
import {
  PALEMBANG_ODP_LIST,
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  sanitizeUiErrorMessage,
} from '@repo/shared';
import { ApiClient } from '../api/client';
import { offlineQueue, OfflineTicketSubmission } from '../sync/offlineQueue';
import { getEncryptedItem, setEncryptedItem } from '../storage/persistentStorage';
import { getThemeTokens, formatOpticalTelemetryDbm } from '../theme/tokens';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

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
        setError(
          res.error?.message
            ? sanitizeUiErrorMessage(res.error).message
            : STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
        );
      }
    } catch {
      setError(STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED);
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
      const matchOdp = (t.customer.splitterCode || '').toLowerCase().includes(q);
      const matchAddr = (t.serviceAddress || t.customer.address).toLowerCase().includes(q);
      const matchPlace = (t.locationPlace || '').toLowerCase().includes(q);
      const matchComplaint = (t.complaintSummary || '').toLowerCase().includes(q);
      return matchNum || matchName || matchSia || matchOdp || matchAddr || matchPlace || matchComplaint;
    }
    return true;
  });

  return {
    state: {
      tickets: filteredTickets,
      allTickets: tickets,
      totalTicketsCount: tickets.length,
      psbCount: tickets.filter((t) => t.ticketType === 'PSB').length,
      maintenanceCount: tickets.filter((t) => t.ticketType === 'MAINTENANCE').length,
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
      clearError: () => setError(null),
      syncOfflineQueue: handleManualSync,
      startExecution: handleStartExecution,
      selectTicket: (ticket: MobileTicketItem) => onSelectTicket(ticket, splitters),
      logout: onLogout,
    },
  };
}

function TicketIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

function SyncIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function SearchIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ListIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function WrenchIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ToolsIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      <path d="m18 14 3 3" />
      <path d="m14 18 3 3" />
    </svg>
  );
}

function BuildingIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

function MapPinIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function MapIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function PhoneIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function EditIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ClearIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CopyIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Interactive Field Technician Ticket Dashboard View.
 * Implements high-end obsidian enterprise visual styling, 44px touch targets, and bounded 4px-8px geometry.
 */
export function TicketListView(props: TicketListScreenProps) {
  const { state, actions } = TicketListScreen(props);
  const theme = getThemeTokens(props.themeMode || 'dark');
  const [copiedSia, setCopiedSia] = useState<string | null>(null);

  const psbCount = state.psbCount;
  const mtCount = state.maintenanceCount;

  const handleCopySia = async (e: React.MouseEvent, siaNumber: string) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(siaNumber);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = siaNumber;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999vw';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedSia(siaNumber);
      setTimeout(() => {
        setCopiedSia((prev) => (prev === siaNumber ? null : prev));
      }, 2000);
    } catch (err) {
      console.warn('[TicketList] Gagal menyalin SIA:', err);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '16px 16px 36px',
        color: theme.textPrimary,
        background: theme.bg,
        fontFamily: theme.typography.fontFamily.sans,
        overflowX: 'clip',
      }}
    >
      <style>{`
        .fiberops-input:focus-visible {
          outline: 2px solid #0284C7;
          outline-offset: 1px;
        }
        .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        .fiberops-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .fiberops-action-btn:focus-visible {
          outline: 2px solid #0284C7;
          outline-offset: 2px;
        }
        button, .fiberops-action-btn {
          white-space: nowrap;
        }
      `}</style>

      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '16px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: theme.textPrimary,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            FiberOps Mobile
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
            <span
              style={{
                fontSize: '12px',
                color: theme.textSecondary,
                fontWeight: 400,
              }}
            >
              Regional Palembang
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                color: theme.statusOptimal,
                fontFamily: theme.typography.fontFamily.mono,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '4px',
                  background: theme.statusOptimal,
                  display: 'inline-block',
                }}
              />
              ONLINE
            </span>
          </div>
        </div>
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={props.onLogout || actions.logout}
          style={{
            minHeight: '44px',
            minWidth: '72px',
            padding: '8px 16px',
            background: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: theme.textPrimary,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Keluar
        </button>
      </div>

      {/* Quick Info Card */}
      <div
        style={{
          background: theme.surfaceSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '14px 16px',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              minHeight: '44px',
              borderRadius: '8px',
              background: theme.surfaceElevated,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TicketIcon size={22} color={theme.accentCyan} />
          </div>
          <div>
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: theme.textPrimary,
                margin: 0,
              }}
            >
              Daftar Tiket Lapangan
            </h2>
            <p
              style={{
                fontSize: '12px',
                color: theme.textSecondary,
                margin: '3px 0 0',
              }}
            >
              Teknisi {props.technicianName || 'Andi Pratama'} | {state.splitters.length} ODP Palembang
            </p>
          </div>
        </div>

        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => void actions.refresh()}
          disabled={state.isLoading}
          style={{
            minHeight: '44px',
            padding: '8px 14px',
            background: theme.surfaceElevated,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: theme.textSecondary,
            fontSize: '12px',
            fontWeight: 600,
            cursor: state.isLoading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <SyncIcon size={14} color={theme.textSecondary} />
          <span>{state.isLoading ? 'Memuat…' : 'Sejarkan'}</span>
        </button>
      </div>

      {/* 3-Column KPI Summary Strip with Interactive Quick-Filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => actions.setFilterType('ALL')}
          aria-pressed={state.filterType === 'ALL'}
          title="Tampilkan Semua Tiket"
          style={{
            minHeight: '44px',
            background: state.filterType === 'ALL' ? theme.surfaceElevated : theme.surfaceSecondary,
            border: state.filterType === 'ALL' ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
            boxShadow: state.filterType === 'ALL' ? '0 0 12px rgba(2, 132, 199, 0.25)' : 'none',
            borderRadius: '8px',
            padding: '12px 14px',
            boxSizing: 'border-box',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: state.filterType === 'ALL' ? theme.accentCyan : theme.textSecondary,
                fontWeight: 600,
              }}
            >
              Total Aktif
            </span>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '4px',
                background: theme.statusOptimal,
                display: 'inline-block',
              }}
            />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textPrimary, lineHeight: 1 }}>
            {state.totalTicketsCount}
          </div>
        </button>

        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => actions.setFilterType('PSB')}
          aria-pressed={state.filterType === 'PSB'}
          title="Filter Tiket Pasang Baru (PSB)"
          style={{
            minHeight: '44px',
            background: state.filterType === 'PSB' ? theme.surfaceElevated : theme.surfaceSecondary,
            border: state.filterType === 'PSB' ? `1px solid ${theme.statusNew}` : `1px solid ${theme.border}`,
            boxShadow: state.filterType === 'PSB' ? '0 0 12px rgba(14, 165, 233, 0.25)' : 'none',
            borderRadius: '8px',
            padding: '12px 14px',
            boxSizing: 'border-box',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: state.filterType === 'PSB' ? theme.accentCyan : theme.textSecondary,
                fontWeight: 600,
              }}
            >
              Pasang Baru
            </span>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '4px',
                background: theme.statusNew,
                display: 'inline-block',
              }}
            />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: theme.textPrimary, lineHeight: 1 }}>
            {psbCount}
          </div>
        </button>

        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => actions.setFilterType('MAINTENANCE')}
          aria-pressed={state.filterType === 'MAINTENANCE'}
          title="Filter Tiket Gangguan (Maintenance)"
          style={{
            minHeight: '44px',
            background: state.filterType === 'MAINTENANCE' ? theme.surfaceElevated : theme.surfaceSecondary,
            border: state.filterType === 'MAINTENANCE' ? `1px solid ${theme.statusWarning}` : `1px solid ${theme.border}`,
            boxShadow: state.filterType === 'MAINTENANCE' ? '0 0 12px rgba(245, 158, 11, 0.25)' : 'none',
            borderRadius: '8px',
            padding: '12px 14px',
            boxSizing: 'border-box',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: state.filterType === 'MAINTENANCE' ? theme.statusWarning : theme.textSecondary,
                fontWeight: 600,
              }}
            >
              Gangguan
            </span>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '4px',
                background: theme.statusWarning,
                display: 'inline-block',
              }}
            />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: theme.statusWarning, lineHeight: 1 }}>
            {mtCount}
          </div>
        </button>
      </div>

      {/* Sticky Offline Queue Sync Banner */}
      {state.offlineQueueCount > 0 && (
        <div
          role="status"
          style={{
            background: theme.surfaceSecondary,
            border: `1px solid ${theme.statusWarning}`,
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: theme.statusWarning }}>
              Antrean Offline Tersimpan ({state.offlineQueueCount} Laporan)
            </div>
            <div style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '2px' }}>
              Data terenkripsi siap dikirim saat sinyal stabil.
            </div>
          </div>
          <button
            type="button"
            className="fiberops-action-btn"
            disabled={state.isSyncing}
            onClick={() => void actions.syncOfflineQueue()}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              background: theme.statusWarning,
              color: theme.primaryText,
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: state.isSyncing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {state.isSyncing ? 'Sinkronisasi…' : 'Sinkronkan Sekarang'}
          </button>
        </div>
      )}

      {/* Search Input Bar with Clear Button */}
      <div
        style={{
          position: 'relative',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <SearchIcon size={18} color={theme.textMuted} />
        </div>
        <input
          type="text"
          className="fiberops-input"
          value={state.searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          placeholder="Cari No. Tiket, Nama Pelanggan, SIA, atau Lokasi…"
          style={{
            width: '100%',
            height: '48px',
            minHeight: '48px',
            padding: state.searchQuery ? '0 44px 0 42px' : '0 14px 0 42px',
            fontSize: '13px',
            background: theme.surfaceSecondary,
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {state.searchQuery.length > 0 && (
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => actions.setSearchQuery('')}
            aria-label="Hapus kata kunci pencarian"
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '36px',
              height: '36px',
              minHeight: '36px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '6px',
              color: theme.textSecondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ClearIcon size={14} color={theme.textSecondary} />
          </button>
        )}
      </div>

      {/* Segmented Filter Category Pills with Count Badges */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        {(['ALL', 'PSB', 'MAINTENANCE'] as const).map((tab) => {
          const isActive = state.filterType === tab;
          const label = tab === 'ALL' ? 'Semua' : tab === 'PSB' ? 'PSB' : 'Maintenance';
          const count = tab === 'ALL' ? state.totalTicketsCount : tab === 'PSB' ? psbCount : mtCount;
          return (
            <button
              key={tab}
              type="button"
              className="fiberops-action-btn"
              onClick={() => actions.setFilterType(tab)}
              style={{
                minHeight: '44px',
                padding: '8px 8px',
                background: isActive ? theme.primary : theme.surfaceSecondary,
                color: isActive ? theme.primaryText : theme.textSecondary,
                border: `1px solid ${isActive ? theme.primary : theme.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: isActive ? '0 2px 10px rgba(2, 132, 199, 0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'ALL' && <ListIcon size={15} color={isActive ? theme.primaryText : theme.textSecondary} />}
              {tab === 'PSB' && <WrenchIcon size={15} color={isActive ? theme.primaryText : theme.textSecondary} />}
              {tab === 'MAINTENANCE' && <ToolsIcon size={15} color={isActive ? theme.primaryText : theme.textSecondary} />}
              <span>{label}</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? theme.primaryText : theme.textMuted,
                  fontWeight: 700,
                  fontFamily: theme.typography.fontFamily.mono,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error / Offline Cache Notice */}
      {state.error && (
        <ErrorBanner
          message={state.error}
          onRetry={actions.refresh}
          retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
          onDismiss={actions.clearError}
          themeMode={props.themeMode || 'dark'}
        />
      )}

      {/* Ticket List Cards */}
      {state.isLoading && state.tickets.length === 0 ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            background: theme.surfaceSecondary,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: theme.textSecondary,
            fontSize: '13px',
          }}
        >
          Memuat antrean tiket penugasan teknisi…
        </div>
      ) : state.tickets.length === 0 ? (
        state.searchQuery.trim().length > 0 || state.filterType !== 'ALL' ? (
          <EmptyState
            icon="search"
            title="Tidak Ada Tiket yang Sesuai"
            description="Tidak ditemukan tiket lapangan yang sesuai dengan kata kunci atau filter yang Anda pilih."
            actionLabel="Reset Filter"
            onAction={() => {
              actions.setSearchQuery('');
              actions.setFilterType('ALL');
            }}
            actionVariant="secondary"
            themeMode={props.themeMode || 'dark'}
          />
        ) : (
          <EmptyState
            icon="ticket"
            title="Belum Ada Tiket Ditugaskan"
            description="Saat ini belum ada penugasan tiket lapangan untuk Anda. Tarik atau tekan tombol untuk memuat ulang data."
            actionLabel="Muat Ulang Data"
            onAction={() => void actions.refresh()}
            actionVariant="primary"
            themeMode={props.themeMode || 'dark'}
          />
        )
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

            const isMaintenance = ticket.ticketType === 'MAINTENANCE';

            return (
              <div
                key={ticket.id}
                style={{
                  background: theme.surfaceSecondary,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.35)',
                }}
              >
                {/* 3 Header Badges */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Badge 1: Ticket Number */}
                  <span
                    style={{
                      fontFamily: theme.typography.fontFamily.mono,
                      fontSize: '11px',
                      fontWeight: 700,
                      color: theme.textPrimary,
                      background: theme.badgeBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '4px',
                      padding: '3px 8px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    NO. {ticket.ticketNumber}
                  </span>

                  {/* Badge 2: Category Badge (MAINTENANCE or PSB) */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: theme.primaryText,
                      background: isMaintenance ? theme.statusWarning : theme.statusNew,
                      borderRadius: '4px',
                      padding: '3px 8px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {ticket.ticketType}
                  </span>

                  {/* Badge 3: Status Badge */}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: theme.accentCyan,
                      background: 'rgba(14, 165, 233, 0.15)',
                      border: '1px solid rgba(14, 165, 233, 0.3)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>

                {/* NOC Rejection Banner if returned */}
                {ticket.rejectionReason && (
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(185, 28, 28, 0.15)',
                      border: '1px solid rgba(185, 28, 28, 0.35)',
                      borderRadius: '6px',
                      color: theme.statusCritical,
                      fontSize: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    <strong>Revisi NOC:</strong> {ticket.rejectionReason}
                  </div>
                )}

                {/* Customer Title */}
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: theme.textPrimary,
                    letterSpacing: '-0.01em',
                    marginBottom: '6px',
                  }}
                >
                  {ticket.customer.fullName.toUpperCase()}
                </div>

                {/* Metadata Row: Building icon + SIA / ODP with One-Tap Copy */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                    fontFamily: theme.typography.fontFamily.mono,
                    marginBottom: '6px',
                  }}
                >
                  <BuildingIcon size={14} color={theme.textMuted} />
                  <span>SIA :</span>
                  <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{ticket.customer.siaNumber}</span>
                  <button
                    type="button"
                    className="fiberops-action-btn"
                    onClick={(e) => handleCopySia(e, ticket.customer.siaNumber)}
                    title="Salin No. SIA"
                    aria-label={`Salin No. SIA ${ticket.customer.siaNumber}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      minHeight: '28px',
                      padding: '2px 8px',
                      background:
                        copiedSia === ticket.customer.siaNumber
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(255, 255, 255, 0.06)',
                      border: `1px solid ${
                        copiedSia === ticket.customer.siaNumber
                          ? theme.statusOptimal
                          : theme.border
                      }`,
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: copiedSia === ticket.customer.siaNumber ? theme.statusOptimal : theme.textSecondary,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedSia === ticket.customer.siaNumber ? (
                      <>
                        <CheckIcon size={11} color={theme.statusOptimal} />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={11} color={theme.textSecondary} />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                  <span style={{ color: theme.borderLight }}>|</span>
                  <span>ODP : {ticket.customer.splitterCode || 'ODP-PLB-001'}</span>
                </div>

                {/* Optical Attenuation Telemetry Badge */}
                {ticket.customer.currentAttenuation !== null && ticket.customer.currentAttenuation !== undefined && (
                  <div style={{ marginBottom: '8px' }}>
                    {(() => {
                      const telemetry = formatOpticalTelemetryDbm(ticket.customer.currentAttenuation);
                      return (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 8px',
                            background: telemetry.bg,
                            border: `1px solid ${telemetry.border}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: telemetry.color,
                            fontFamily: theme.typography.fontFamily.mono,
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '4px',
                              background: telemetry.color,
                              display: 'inline-block',
                            }}
                          />
                          <span>Telemetri Redaman: {telemetry.label}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Location Row: Map Pin icon + Address */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                    lineHeight: 1.45,
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: '2px' }}>
                    <MapPinIcon size={14} color={theme.textMuted} />
                  </div>
                  <span>
                    {ticket.locationPlace ? `${ticket.locationPlace} - ` : ''}
                    {ticket.serviceAddress || ticket.customer.address}
                  </span>
                </div>

                {/* Complaint / Notes Inset Box */}
                {ticket.complaintSummary && (
                  <div
                    style={{
                      background: theme.surfaceInset,
                      borderLeft: `3px solid ${theme.accentCyan}`,
                      borderTop: `1px solid ${theme.border}`,
                      borderRight: `1px solid ${theme.border}`,
                      borderBottom: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: theme.accentCyan,
                        marginBottom: '4px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Keluhan / Catatan:
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: theme.textPrimary,
                        lineHeight: 1.5,
                      }}
                    >
                      {ticket.complaintSummary}
                    </div>
                  </div>
                )}

                {/* Action Buttons Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: ticket.customerPhone ? '1fr 1fr 1.3fr' : '1fr 1.3fr',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fiberops-action-btn"
                    style={{
                      minHeight: '44px',
                      padding: '10px 8px',
                      background: theme.surfaceElevated,
                      color: theme.textPrimary,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxSizing: 'border-box',
                      textAlign: 'center',
                    }}
                  >
                    <MapIcon size={14} color={theme.textPrimary} />
                    <span>Rute Peta</span>
                  </a>

                  {ticket.customerPhone && (
                    <a
                      href={`tel:${ticket.customerPhone}`}
                      className="fiberops-action-btn"
                      style={{
                        minHeight: '44px',
                        padding: '10px 8px',
                        background: theme.surfaceElevated,
                        color: theme.textPrimary,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxSizing: 'border-box',
                        textAlign: 'center',
                      }}
                    >
                      <PhoneIcon size={14} color={theme.textPrimary} />
                      <span>Hubungi</span>
                    </a>
                  )}

                  <button
                    type="button"
                    className="fiberops-action-btn"
                    onClick={() => actions.selectTicket(ticket)}
                    style={{
                      minHeight: '44px',
                      padding: '10px 8px',
                      background: theme.primary,
                      color: theme.primaryText,
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
                    }}
                  >
                    <EditIcon size={14} color={theme.primaryText} />
                    <span>{ticket.status === 'OPEN' ? 'Mulai & Ukur OPM' : 'Isi Laporan OPM'}</span>
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
