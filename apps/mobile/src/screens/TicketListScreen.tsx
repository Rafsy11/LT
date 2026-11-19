import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [filterOdp, setFilterOdp] = useState<string>('ALL');
  const [filterCustomer, setFilterCustomer] = useState<string>('ALL');
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

  const resetAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('ALL');
    setFilterOdp('ALL');
    setFilterCustomer('ALL');
  }, []);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterType !== 'ALL' && t.ticketType !== filterType) {
        return false;
      }
      if (filterOdp !== 'ALL' && t.customer.splitterCode !== filterOdp) {
        return false;
      }
      if (filterCustomer !== 'ALL' && t.customer.fullName !== filterCustomer) {
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
  }, [tickets, filterType, filterOdp, filterCustomer, searchQuery]);

  const isFilterActive =
    filterType !== 'ALL' ||
    filterOdp !== 'ALL' ||
    filterCustomer !== 'ALL' ||
    searchQuery.trim().length > 0;

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
      filterOdp,
      filterCustomer,
      isFilterActive,
      searchQuery,
      error,
    },
    actions: {
      setFilterType,
      setFilterOdp,
      setFilterCustomer,
      resetAllFilters,
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

function SyncIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function LogOutIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function FilterIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function SearchIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ClearIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CopyIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PhoneIcon({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MapPinIcon({ size = 12, color = 'currentColor', style }: { size?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'Menunggu Persetujuan';
    case 'IN_PROGRESS':
      return 'Sedang Dikerjakan';
    case 'OPEN':
      return 'Baru Diterima';
    default:
      return status.replace(/_/g, ' ');
  }
}

function getStatusBadgeStyle(status: string, isDark: boolean) {
  switch (status) {
    case 'PENDING_APPROVAL':
      return {
        color: isDark ? '#93C5FD' : '#1D4ED8',
        bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
        border: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
      };
    case 'IN_PROGRESS':
      return {
        color: isDark ? '#FCD34D' : '#B45309',
        bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
        border: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
      };
    case 'OPEN':
      return {
        color: isDark ? '#86EFAC' : '#15803D',
        bg: isDark ? 'rgba(34, 197, 94, 0.15)' : '#F0FDF4',
        border: isDark ? 'rgba(34, 197, 94, 0.3)' : '#BBF7D0',
      };
    default:
      return {
        color: isDark ? '#94A3B8' : '#64748B',
        bg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
        border: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
      };
  }
}

/**
 * Redesigned Industrial Field Technician Ticket View.
 * Clean, high-contrast, compact slim cards, free from AI slop.
 */
export function TicketListView(props: TicketListScreenProps) {
  const { state, actions } = TicketListScreen(props);
  const theme = getThemeTokens(props.themeMode || 'light');
  const isDark = props.themeMode === 'dark';
  const [copiedSia, setCopiedSia] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Extract unique ODP codes from current ticket set
  const availableOdps = useMemo(() => {
    const set = new Set<string>();
    state.allTickets.forEach((t) => {
      if (t.customer.splitterCode) {
        set.add(t.customer.splitterCode);
      }
    });
    return Array.from(set);
  }, [state.allTickets]);

  // Extract unique Customer names from current ticket set
  const availableCustomers = useMemo(() => {
    const set = new Set<string>();
    state.allTickets.forEach((t) => {
      if (t.customer.fullName) {
        set.add(t.customer.fullName);
      }
    });
    return Array.from(set);
  }, [state.allTickets]);

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
        background: isDark ? '#080E1A' : '#F8FAFC',
        fontFamily: theme.typography.fontFamily.sans,
        overflowX: 'clip',
      }}
    >
      <style>{`
        .fiberops-input:focus-visible {
          outline: 2px solid #1B5CA2;
          outline-offset: 1px;
        }
        .fiberops-input {
          background-color: #FFFFFF !important;
          color: #0F172A !important;
          color-scheme: light;
        }
        .fiberops-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset !important;
          -webkit-text-fill-color: #0F172A !important;
        }
        .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        .fiberops-action-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .fiberops-action-btn:focus-visible {
          outline: 2px solid #1B5CA2;
          outline-offset: 2px;
        }
        @keyframes fiberops-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-icon {
          animation: fiberops-spin 0.8s linear infinite;
        }
      `}</style>

      {/* Top Operator Header Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '14px',
          borderBottom: `1px solid ${theme.border}`,
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="/assets/Lintasarta-Icon.svg"
            alt="Lintasarta"
            width={36}
            height={36}
            style={{ display: 'block', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textPrimary, lineHeight: 1.2 }}>
              {props.technicianName || 'Andi Pratama'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: theme.textSecondary, fontWeight: 500 }}>
                Regional Palembang
              </span>
              <span style={{ color: theme.border }}>•</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isDark ? '#4ADE80' : '#15803D',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isDark ? '#4ADE80' : '#15803D',
                    display: 'inline-block',
                  }}
                />
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Action Buttons (Sync reload only + Logout icon only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => void actions.refresh()}
            disabled={state.isLoading}
            aria-label="Sinkronkan data tiket"
            title="Sinkronkan data tiket"
            style={{
              width: '40px',
              height: '40px',
              minHeight: '40px',
              padding: 0,
              background: isDark ? '#10192D' : '#FFFFFF',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textSecondary,
              cursor: state.isLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className={state.isLoading ? 'animate-spin-icon' : ''}>
              <SyncIcon size={16} color={theme.textSecondary} />
            </span>
          </button>

          <button
            type="button"
            className="fiberops-action-btn"
            onClick={props.onLogout || actions.logout}
            aria-label="Keluar dari akun teknisi"
            title="Keluar dari akun teknisi"
            style={{
              width: '40px',
              height: '40px',
              minHeight: '40px',
              padding: 0,
              background: isDark ? '#10192D' : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA'}`,
              borderRadius: '6px',
              color: isDark ? '#F87171' : '#DC2626',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogOutIcon size={16} color={isDark ? '#F87171' : '#DC2626'} />
          </button>
        </div>
      </header>

      {/* Sticky Offline Queue Sync Banner */}
      {state.offlineQueueCount > 0 && (
        <div
          role="status"
          style={{
            background: isDark ? '#1C150A' : '#FEF3C7',
            border: `1px solid ${isDark ? '#F59E0B' : '#FDE68A'}`,
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#FBBF24' : '#92400E' }}>
              Antrean Offline ({state.offlineQueueCount} Laporan)
            </div>
            <div style={{ fontSize: '11px', color: isDark ? '#FCD34D' : '#B45309', marginTop: '1px' }}>
              Tersimpan lokal, siap dikirim saat sinyal stabil.
            </div>
          </div>
          <button
            type="button"
            className="fiberops-action-btn"
            disabled={state.isSyncing}
            onClick={() => void actions.syncOfflineQueue()}
            style={{
              minHeight: '38px',
              padding: '6px 14px',
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
            {state.isSyncing ? 'Sinkron...' : 'Kirim Sekarang'}
          </button>
        </div>
      )}

      {/* Filter Button + Search Input + Reset 'X' Button Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: isFilterOpen ? '8px' : '14px',
        }}
      >
        {/* Left Filter Toggle Button */}
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => setIsFilterOpen((prev) => !prev)}
          aria-expanded={isFilterOpen}
          aria-label="Buka filter tiket"
          title="Filter tiket"
          style={{
            height: '42px',
            minHeight: '42px',
            padding: '0 12px',
            background: state.isFilterActive
              ? isDark
                ? '#1E3A8A'
                : '#DBEAFE'
              : isDark
                ? '#10192D'
                : '#FFFFFF',
            border: `1px solid ${state.isFilterActive ? '#1B5CA2' : theme.border}`,
            borderRadius: '6px',
            color: state.isFilterActive
              ? isDark
                ? '#93C5FD'
                : '#1D4ED8'
              : theme.textSecondary,
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <FilterIcon size={15} color="currentColor" />
          <span>Filter</span>
          {state.isFilterActive && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#1B5CA2',
                display: 'inline-block',
              }}
            />
          )}
        </button>

        {/* Center Search Input Box */}
        <div style={{ position: 'relative', flex: 1 }}>
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <SearchIcon size={15} color={theme.textMuted} />
          </div>
          <input
            type="text"
            className="fiberops-input"
            value={state.searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            placeholder="Cari no. tiket, pelanggan, ODP, SIA..."
            style={{
              width: '100%',
              height: '42px',
              minHeight: '42px',
              padding: '0 12px 0 34px',
              fontSize: '13px',
              background: isDark ? '#10192D' : '#FFFFFF',
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        {/* Right 'X' Reset Button */}
        <button
          type="button"
          className="fiberops-action-btn"
          onClick={() => {
            actions.resetAllFilters();
            setIsFilterOpen(false);
          }}
          aria-label="Kembalikan filter dan pencarian ke semula"
          title="Reset filter & pencarian ke semula"
          style={{
            width: '42px',
            height: '42px',
            minHeight: '42px',
            padding: 0,
            background: isDark ? '#10192D' : '#FFFFFF',
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            color: state.isFilterActive ? (isDark ? '#FCA5A5' : '#DC2626') : theme.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ClearIcon size={16} color="currentColor" />
        </button>
      </div>

      {/* Expandable Filter Box Panel */}
      {isFilterOpen && (
        <div
          style={{
            background: isDark ? '#10192D' : '#FFFFFF',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '14px',
            boxShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
              Opsi Filter Tiket
            </span>
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => actions.resetAllFilters()}
              style={{
                background: 'transparent',
                border: 'none',
                color: isDark ? '#93C5FD' : '#1D4ED8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Reset Opsi
            </button>
          </div>

          {/* 1. Filter Jenis Tiket */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Jenis Tiket
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {(
                [
                  { key: 'ALL', label: 'Semua' },
                  { key: 'PSB', label: 'Pasang Baru' },
                  { key: 'MAINTENANCE', label: 'Gangguan' },
                ] as const
              ).map((item) => {
                const isSelected = state.filterType === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="fiberops-action-btn"
                    onClick={() => actions.setFilterType(item.key)}
                    style={{
                      minHeight: '34px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                      background: isSelected ? '#1B5CA2' : isDark ? '#080E1A' : '#F1F5F9',
                      color: isSelected ? '#FFFFFF' : theme.textPrimary,
                      fontSize: '12px',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Filter ODP */}
          {availableOdps.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ODP Terkait
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  type="button"
                  className="fiberops-action-btn"
                  onClick={() => actions.setFilterOdp('ALL')}
                  style={{
                    minHeight: '30px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${state.filterOdp === 'ALL' ? '#1B5CA2' : theme.border}`,
                    background: state.filterOdp === 'ALL' ? '#1B5CA2' : isDark ? '#080E1A' : '#F1F5F9',
                    color: state.filterOdp === 'ALL' ? '#FFFFFF' : theme.textPrimary,
                    fontSize: '11px',
                    fontWeight: state.filterOdp === 'ALL' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Semua ODP
                </button>
                {availableOdps.map((odp) => {
                  const isSelected = state.filterOdp === odp;
                  return (
                    <button
                      key={odp}
                      type="button"
                      className="fiberops-action-btn"
                      onClick={() => actions.setFilterOdp(odp)}
                      style={{
                        minHeight: '30px',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                        background: isSelected ? '#1B5CA2' : isDark ? '#080E1A' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : theme.textPrimary,
                        fontSize: '11px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        fontFamily: theme.typography.fontFamily.mono,
                      }}
                    >
                      {odp}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Filter Pelanggan */}
          {availableCustomers.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: theme.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pelanggan Terkait
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  type="button"
                  className="fiberops-action-btn"
                  onClick={() => actions.setFilterCustomer('ALL')}
                  style={{
                    minHeight: '30px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${state.filterCustomer === 'ALL' ? '#1B5CA2' : theme.border}`,
                    background: state.filterCustomer === 'ALL' ? '#1B5CA2' : isDark ? '#080E1A' : '#F1F5F9',
                    color: state.filterCustomer === 'ALL' ? '#FFFFFF' : theme.textPrimary,
                    fontSize: '11px',
                    fontWeight: state.filterCustomer === 'ALL' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Semua Pelanggan
                </button>
                {availableCustomers.map((cust) => {
                  const isSelected = state.filterCustomer === cust;
                  return (
                    <button
                      key={cust}
                      type="button"
                      className="fiberops-action-btn"
                      onClick={() => actions.setFilterCustomer(cust)}
                      style={{
                        minHeight: '30px',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                        background: isSelected ? '#1B5CA2' : isDark ? '#080E1A' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : theme.textPrimary,
                        fontSize: '11px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {cust}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => setIsFilterOpen(false)}
              style={{
                minHeight: '32px',
                padding: '4px 12px',
                background: '#1B5CA2',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tutup Filter
            </button>
          </div>
        </div>
      )}

      {/* Error / Alert Notice */}
      {state.error && (
        <div style={{ marginBottom: '14px' }}>
          <ErrorBanner
            message={state.error}
            onRetry={actions.refresh}
            retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
            onDismiss={actions.clearError}
            themeMode={props.themeMode || 'light'}
          />
        </div>
      )}

      {/* Ticket List Cards Container */}
      {state.isLoading && state.tickets.length === 0 ? (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            background: isDark ? '#10192D' : '#FFFFFF',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: theme.textSecondary,
            fontSize: '13px',
          }}
        >
          Memuat daftar penugasan tiket lapangan...
        </div>
      ) : state.tickets.length === 0 ? (
        state.isFilterActive ? (
          <EmptyState
            icon="search"
            title="Tidak Ada Tiket yang Sesuai"
            description="Tidak ditemukan tiket yang sesuai dengan pencarian atau opsi filter yang dipilih."
            actionLabel="Reset Semua Filter"
            onAction={() => actions.resetAllFilters()}
            actionVariant="secondary"
            themeMode={props.themeMode || 'light'}
          />
        ) : (
          <EmptyState
            icon="ticket"
            title="Belum Ada Tiket Ditugaskan"
            description="Saat ini belum ada tiket kerja lapangan aktif untuk Anda. Tekan tombol sinkron untuk memuat data terbaru."
            actionLabel="Sinkronkan Data"
            onAction={() => void actions.refresh()}
            actionVariant="primary"
            themeMode={props.themeMode || 'light'}
          />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
            const statusStyle = getStatusBadgeStyle(ticket.status, isDark);

            return (
              <article
                key={ticket.id}
                style={{
                  background: isDark ? '#10192D' : '#FFFFFF',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  boxSizing: 'border-box',
                }}
              >
                {/* 1. Bagian Atas: Nama Pelanggan (Left) + #WO-... (Right) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '6px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: theme.textPrimary,
                      margin: 0,
                      lineHeight: 1.25,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {ticket.customer.fullName}
                  </h3>

                  <span
                    style={{
                      fontFamily: theme.typography.fontFamily.mono,
                      fontSize: '12px',
                      fontWeight: 700,
                      color: theme.textSecondary,
                      flexShrink: 0,
                    }}
                  >
                    #{ticket.ticketNumber}
                  </span>
                </div>

                {/* 2. Dibawah Nama Pelanggan: Status Tiket + Jenis Tiket + Telemetri */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  {/* Status Badge */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: statusStyle.color,
                      background: statusStyle.bg,
                      border: `1px solid ${statusStyle.border}`,
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {formatStatusLabel(ticket.status)}
                  </span>

                  {/* Jenis Tiket Badge */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: '#FFFFFF',
                      background: isMaintenance ? '#D97706' : '#1B5CA2',
                    }}
                  >
                    {isMaintenance ? 'Gangguan' : 'Pasang Baru'}
                  </span>

                  {/* Telemetri Redaman (Optical Telemetry) */}
                  {ticket.customer.currentAttenuation !== null &&
                    ticket.customer.currentAttenuation !== undefined && (
                      <div style={{ flexShrink: 0 }}>
                        {(() => {
                          const telemetry = formatOpticalTelemetryDbm(ticket.customer.currentAttenuation);
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 6px',
                                background: telemetry.bg,
                                border: `1px solid ${telemetry.border}`,
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: telemetry.color,
                                fontFamily: theme.typography.fontFamily.mono,
                              }}
                            >
                              {telemetry.label}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                </div>

                {/* NOC Rejection Notice if applicable */}
                {ticket.rejectionReason && (
                  <div
                    style={{
                      padding: '6px 10px',
                      background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                      border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA'}`,
                      borderRadius: '4px',
                      color: isDark ? '#FCA5A5' : '#B91C1C',
                      fontSize: '11px',
                      marginBottom: '8px',
                      lineHeight: 1.35,
                    }}
                  >
                    <strong>Revisi NOC:</strong> {ticket.rejectionReason}
                  </div>
                )}

                {/* 3. Secara Terstruktur: ODP, SIA, dan Alamat */}
                <div
                  style={{
                    fontSize: '12px',
                    fontFamily: theme.typography.fontFamily.mono,
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <span style={{ color: theme.textSecondary }}>ODP:</span>
                  <span style={{ color: theme.textPrimary, fontWeight: 700 }}>
                    {ticket.customer.splitterCode || 'ODP-PLB-034'}
                  </span>

                  <span style={{ color: theme.border }}>•</span>

                  <span style={{ color: theme.textSecondary }}>SIA:</span>
                  <span style={{ color: theme.textPrimary, fontWeight: 700 }}>
                    {ticket.customer.siaNumber}
                  </span>

                  <button
                    type="button"
                    className="fiberops-action-btn"
                    onClick={(e) => handleCopySia(e, ticket.customer.siaNumber)}
                    title="Salin nomor SIA"
                    aria-label={`Salin nomor SIA ${ticket.customer.siaNumber}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      minHeight: '22px',
                      padding: '1px 6px',
                      background: copiedSia === ticket.customer.siaNumber ? '#10B981' : isDark ? '#1E293B' : '#F1F5F9',
                      color: copiedSia === ticket.customer.siaNumber ? '#FFFFFF' : theme.textPrimary,
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSia === ticket.customer.siaNumber ? (
                      <>
                        <CheckIcon size={10} color="#FFFFFF" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={10} color="currentColor" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Alamat Lengkap & Rute Peta Terintegrasi */}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '5px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                    lineHeight: 1.4,
                    marginBottom: ticket.complaintSummary ? '6px' : '10px',
                    textDecoration: 'none',
                  }}
                  title="Buka navigasi Google Maps"
                >
                  <MapPinIcon size={13} color={theme.textMuted} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    {ticket.locationPlace ? `${ticket.locationPlace} • ` : ''}
                    {ticket.serviceAddress || ticket.customer.address}
                  </span>
                </a>

                {/* Keluhan / Catatan jika tersedia */}
                {ticket.complaintSummary && (
                  <div
                    style={{
                      background: isDark ? '#0A1224' : '#F1F5F9',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '4px',
                      padding: '6px 10px',
                      marginBottom: '10px',
                      fontSize: '11px',
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: theme.textSecondary, marginRight: '4px' }}>
                      Keluhan:
                    </span>
                    <span style={{ color: theme.textPrimary }}>{ticket.complaintSummary}</span>
                  </div>
                )}

                {/* 4. Dibawahnya lagi: 2 Kotak Berdampingan ("Logo Telepon" & "ISI Laporan") */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {/* Kotak 1: Logo Telepon */}
                  {ticket.customerPhone ? (
                    <a
                      href={`tel:${ticket.customerPhone}`}
                      className="fiberops-action-btn"
                      aria-label={`Hubungi telepon pelanggan ${ticket.customer.fullName}`}
                      title={`Hubungi: ${ticket.customerPhone}`}
                      style={{
                        width: '46px',
                        height: '42px',
                        minHeight: '42px',
                        padding: 0,
                        background: isDark ? '#1E293B' : '#F1F5F9',
                        color: theme.textPrimary,
                        border: `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                        flexShrink: 0,
                        boxSizing: 'border-box',
                      }}
                    >
                      <PhoneIcon size={16} color={theme.textPrimary} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-label="Nomor telepon pelanggan tidak tersedia"
                      title="Nomor telepon pelanggan tidak tersedia"
                      style={{
                        width: '46px',
                        height: '42px',
                        minHeight: '42px',
                        padding: 0,
                        background: isDark ? '#1E293B' : '#F1F5F9',
                        color: theme.textMuted,
                        border: `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.5,
                        cursor: 'not-allowed',
                        flexShrink: 0,
                        boxSizing: 'border-box',
                      }}
                    >
                      <PhoneIcon size={16} color={theme.textMuted} />
                    </button>
                  )}

                  {/* Kotak 2: ISI Laporan / Mulai Kerja */}
                  <button
                    type="button"
                    className="fiberops-action-btn"
                    onClick={() => actions.selectTicket(ticket)}
                    style={{
                      flex: 1,
                      height: '42px',
                      minHeight: '42px',
                      padding: '0 16px',
                      background: '#1B5CA2',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {ticket.status === 'OPEN' ? 'Mulai Kerja' : 'Isi Laporan'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
