import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  PALEMBANG_ODP_LIST,
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  sanitizeUiErrorMessage,
  MOBILE_HISTORY_LIMIT,
  MobileTicketItemDto,
  MobileSplitterItemDto,
  UserTypeEnum,
} from '@repo/shared';
import { ApiClient } from '../api/client';
import { offlineQueue, OfflineTicketSubmission } from '../sync/offlineQueue';
import { getEncryptedItem, setEncryptedItem } from '../storage/persistentStorage';
import { getThemeTokens, formatOpticalTelemetryDbm } from '../theme/tokens';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';

const STORAGE_KEY_CACHED_TICKETS = '@fiberops_cached_tickets_v1';
export const STORAGE_KEY_CACHED_HISTORY_TICKETS = '@fiberops_cached_history_tickets_v1';
const STORAGE_KEY_CACHED_ODPS = '@fiberops_cached_odps_v1';
const HISTORY_STALE_MS = 30_000;

export interface MobileTicketItem extends MobileTicketItemDto {
  id: string;
}

export interface SplitterItem extends MobileSplitterItemDto {
  id: string;
}

export type MobileThemePreference = 'light' | 'dark' | 'system';

const THEME_OPTIONS: Array<{
  value: MobileThemePreference;
  label: string;
  icon: 'sun' | 'moon' | 'monitor';
}> = [
  { value: 'light', label: 'Terang (Light)', icon: 'sun' },
  { value: 'dark', label: 'Gelap (Dark)', icon: 'moon' },
  { value: 'system', label: 'Sistem (Otomatis)', icon: 'monitor' },
];

export interface TicketListScreenProps {
  apiClient: ApiClient;
  onSelectTicket: (ticket: MobileTicketItem, splitters: SplitterItem[]) => void;
  onLogout: () => void;
  technicianName?: string;
  userType?: UserTypeEnum;
  networkMode?: 'online' | 'flaky' | 'offline';
  themeMode?: 'light' | 'dark' | 'outdoorSunlight';
  themePreference?: MobileThemePreference;
  onChangeThemePreference?: (preference: MobileThemePreference) => void;
}

interface TabFilterState {
  filterType: 'ALL' | 'PSB' | 'MAINTENANCE';
  filterOdp: string;
  filterCustomer: string;
  searchQuery: string;
}

const DEFAULT_FILTER_STATE: TabFilterState = {
  filterType: 'ALL',
  filterOdp: 'ALL',
  filterCustomer: 'ALL',
  searchQuery: '',
};

export function TicketListScreen({ apiClient, onSelectTicket, onLogout }: TicketListScreenProps) {
  const [activeTab, setActiveTabState] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [tickets, setTickets] = useState<MobileTicketItem[]>([]);
  const [historyTickets, setHistoryTickets] = useState<MobileTicketItem[]>([]);
  const [historyTotalCount, setHistoryTotalCount] = useState<number>(0);
  const [splitters, setSplitters] = useState<SplitterItem[]>(PALEMBANG_ODP_LIST);
  const [offlineItems, setOfflineItems] = useState<OfflineTicketSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filtersByTab, setFiltersByTab] = useState<{
    ACTIVE: TabFilterState;
    HISTORY: TabFilterState;
  }>({
    ACTIVE: { ...DEFAULT_FILTER_STATE },
    HISTORY: { ...DEFAULT_FILTER_STATE },
  });
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);

  const currentFilters = filtersByTab[activeTab];
  const { filterType, filterOdp, filterCustomer, searchQuery } = currentFilters;

  const updateCurrentTabFilters = useCallback(
    (updater: (prev: TabFilterState) => TabFilterState) => {
      setFiltersByTab((prev) => ({
        ...prev,
        [activeTab]: updater(prev[activeTab]),
      }));
    },
    [activeTab],
  );

  const setFilterType = useCallback(
    (value: 'ALL' | 'PSB' | 'MAINTENANCE') => {
      updateCurrentTabFilters((prev) => ({ ...prev, filterType: value }));
    },
    [updateCurrentTabFilters],
  );

  const setFilterOdp = useCallback(
    (value: string) => {
      updateCurrentTabFilters((prev) => ({ ...prev, filterOdp: value }));
    },
    [updateCurrentTabFilters],
  );

  const setFilterCustomer = useCallback(
    (value: string) => {
      updateCurrentTabFilters((prev) => ({ ...prev, filterCustomer: value }));
    },
    [updateCurrentTabFilters],
  );

  const setSearchQuery = useCallback(
    (value: string) => {
      updateCurrentTabFilters((prev) => ({ ...prev, searchQuery: value }));
    },
    [updateCurrentTabFilters],
  );

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
      if (Array.isArray(cachedTickets) && cachedTickets.length > 0) {
        setTickets(cachedTickets);
      }

      const cachedHistory = await getEncryptedItem<MobileTicketItem[]>(
        STORAGE_KEY_CACHED_HISTORY_TICKETS,
      );
      if (Array.isArray(cachedHistory) && cachedHistory.length > 0) {
        setHistoryTickets(cachedHistory);
        setHistoryTotalCount((prev) => Math.max(prev, cachedHistory.length));
      }
    } catch (err) {
      console.warn('[TicketListScreen] Failed loading local cache:', err);
    }
  }, []);

  const refreshOfflineQueue = useCallback(async () => {
    const queue = await offlineQueue.getQueue();
    setOfflineItems(queue);
  }, []);

  const fetchTickets = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      try {
        if (!silent) {
          setIsLoading(true);
          setError(null);
        }
        const res = await apiClient.request<{
          tickets: MobileTicketItem[];
          historyTickets?: MobileTicketItem[];
          splitters: SplitterItem[];
        }>('/api/v1/tech/tickets');

        if (res.success && res.data) {
          const remoteTickets = Array.isArray(res.data.tickets) ? res.data.tickets : [];
          const hasRemoteHistory = Array.isArray(res.data.historyTickets);
          const remoteHistory = hasRemoteHistory ? res.data.historyTickets || [] : [];
          const remoteSplitters =
            Array.isArray(res.data.splitters) && res.data.splitters.length > 0
              ? res.data.splitters
              : PALEMBANG_ODP_LIST;

          setTickets(remoteTickets);
          setSplitters(remoteSplitters);
          await setEncryptedItem(STORAGE_KEY_CACHED_TICKETS, remoteTickets);
          await setEncryptedItem(STORAGE_KEY_CACHED_ODPS, remoteSplitters);

          if (hasRemoteHistory) {
            setHistoryTickets(remoteHistory);
            const metaCount =
              res.meta && typeof res.meta.historyTotalCount === 'number'
                ? res.meta.historyTotalCount
                : remoteHistory.length;
            setHistoryTotalCount(metaCount);
            await setEncryptedItem(STORAGE_KEY_CACHED_HISTORY_TICKETS, remoteHistory);
          }

          lastFetchedAtRef.current = Date.now();
        } else if (!res.success && !silent) {
          setError(
            res.error?.message
              ? sanitizeUiErrorMessage(res.error).message
              : STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
          );
        }
      } catch {
        if (!silent) {
          setError(STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [apiClient],
  );

  useEffect(() => {
    void loadLocalCache();
    void fetchTickets();
    void refreshOfflineQueue();
  }, [loadLocalCache, fetchTickets, refreshOfflineQueue]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const refreshIfStale = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetchedAtRef.current > HISTORY_STALE_MS) {
        void fetchTickets({ silent: true });
      }
    };
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [fetchTickets]);

  const setActiveTab = useCallback(
    (tab: 'ACTIVE' | 'HISTORY') => {
      setActiveTabState(tab);
      if (tab === 'HISTORY' && Date.now() - lastFetchedAtRef.current > HISTORY_STALE_MS) {
        void fetchTickets({ silent: true });
      }
    },
    [fetchTickets],
  );

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
    updateCurrentTabFilters(() => ({ ...DEFAULT_FILTER_STATE }));
  }, [updateCurrentTabFilters]);

  const filterTicketSet = useCallback(
    (items: MobileTicketItem[], f: TabFilterState) =>
      items.filter((t) => {
        if (f.filterType !== 'ALL' && t.ticketType !== f.filterType) {
          return false;
        }
        if (f.filterOdp !== 'ALL' && t.customer.splitterCode !== f.filterOdp) {
          return false;
        }
        if (f.filterCustomer !== 'ALL' && t.customer.fullName !== f.filterCustomer) {
          return false;
        }
        if (f.searchQuery.trim()) {
          const q = f.searchQuery.toLowerCase();
          const matchNum = t.ticketNumber.toLowerCase().includes(q);
          const matchName = t.customer.fullName.toLowerCase().includes(q);
          const matchSia = t.customer.siaNumber.toLowerCase().includes(q);
          const matchOdp = (t.customer.splitterCode || '').toLowerCase().includes(q);
          const matchAddr = (t.serviceAddress || t.customer.address).toLowerCase().includes(q);
          const matchPlace = (t.locationPlace || '').toLowerCase().includes(q);
          const matchComplaint = (t.complaintSummary || '').toLowerCase().includes(q);
          return (
            matchNum ||
            matchName ||
            matchSia ||
            matchOdp ||
            matchAddr ||
            matchPlace ||
            matchComplaint
          );
        }
        return true;
      }),
    [],
  );

  const filteredTickets = useMemo(
    () => filterTicketSet(tickets, filtersByTab.ACTIVE),
    [filterTicketSet, tickets, filtersByTab.ACTIVE],
  );

  const filteredHistoryTickets = useMemo(
    () => filterTicketSet(historyTickets, filtersByTab.HISTORY),
    [filterTicketSet, historyTickets, filtersByTab.HISTORY],
  );

  const isFilterActive =
    filterType !== 'ALL' ||
    filterOdp !== 'ALL' ||
    filterCustomer !== 'ALL' ||
    searchQuery.trim().length > 0;

  return {
    state: {
      activeTab,
      tickets: filteredTickets,
      allTickets: tickets,
      totalTicketsCount: tickets.length,
      historyTickets: filteredHistoryTickets,
      allHistoryTickets: historyTickets,
      totalHistoryCount: historyTickets.length,
      historyTotalCount,
      historyLimit: MOBILE_HISTORY_LIMIT,
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
      setActiveTab,
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

function SunIcon({ size = 17, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v1 M12 20v1 M4.22 4.22l.7.7 M18.36 18.36l.7.7 M1 12h2 M21 12h2 M4.22 19.78l.7-.7 M18.36 5.64l.7-.7 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
    </svg>
  );
}

function MoonIcon({ size = 17, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon({ size = 17, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M12 17v4 M8 21h8" />
    </svg>
  );
}

function ThemeOptionIcon({
  icon,
  size = 16,
  color = 'currentColor',
}: {
  icon: 'sun' | 'moon' | 'monitor';
  size?: number;
  color?: string;
}) {
  if (icon === 'moon') return <MoonIcon size={size} color={color} />;
  if (icon === 'monitor') return <MonitorIcon size={size} color={color} />;
  return <SunIcon size={size} color={color} />;
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
    case 'COMPLETED':
      return 'Selesai';
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

function getStatusBadgeStyle(
  status: string,
  themeMode: 'light' | 'dark' | 'outdoorSunlight',
) {
  const isDark = themeMode === 'dark';
  const isOutdoor = themeMode === 'outdoorSunlight';

  switch (status) {
    case 'COMPLETED':
      return {
        color: isOutdoor ? '#14532D' : isDark ? '#4ADE80' : '#166534',
        bg: isOutdoor ? '#F0FDF4' : isDark ? '#052E16' : '#F0FDF4',
        border: isOutdoor ? '#14532D' : isDark ? '#065F46' : '#86EFAC',
      };
    case 'PENDING_APPROVAL':
      return {
        color: isOutdoor ? '#0047AB' : isDark ? '#93C5FD' : '#1D4ED8',
        bg: isOutdoor ? '#EFF6FF' : isDark ? '#172554' : '#EFF6FF',
        border: isOutdoor ? '#0047AB' : isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
      };
    case 'IN_PROGRESS':
      return {
        color: isOutdoor ? '#78350F' : isDark ? '#FCD34D' : '#92400E',
        bg: isOutdoor ? '#FEF3C7' : isDark ? '#451A03' : '#FEF3C7',
        border: isOutdoor ? '#78350F' : isDark ? 'rgba(245, 158, 11, 0.35)' : '#FCD34D',
      };
    case 'OPEN':
      return {
        color: isOutdoor ? '#14532D' : isDark ? '#4ADE80' : '#166534',
        bg: isOutdoor ? '#F0FDF4' : isDark ? '#052E16' : '#F0FDF4',
        border: isOutdoor ? '#14532D' : isDark ? '#065F46' : '#86EFAC',
      };
    default:
      return {
        color: isOutdoor ? '#000000' : isDark ? '#CBD5E1' : '#334155',
        bg: isOutdoor ? '#F3F4F6' : isDark ? '#1E293B' : '#F1F5F9',
        border: isOutdoor ? '#000000' : isDark ? 'rgba(255, 255, 255, 0.14)' : '#CBD5E1',
      };
  }
}

function isSafeMediaPreviewUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatWibDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${formatter.format(d).replace(/\./g, ':')} WIB`;
  } catch {
    return dateStr;
  }
}

/**
 * Redesigned Industrial Field Technician Ticket View.
 * Clean, high-contrast, compact slim cards, free from AI slop.
 */
export function TicketListView(props: TicketListScreenProps) {
  const { state, actions } = TicketListScreen(props);
  const themeMode = props.themeMode || 'light';
  const theme = getThemeTokens(themeMode);
  const isDark = themeMode === 'dark';
  const isOutdoor = themeMode === 'outdoorSunlight';
  const cardSurface = isOutdoor ? '#FFFFFF' : isDark ? '#10192D' : '#FFFFFF';
  const insetSurface = isOutdoor ? '#F3F4F6' : isDark ? '#0A1224' : '#F8FAFC';
  const cardBorder = isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`;
  const linkColor = isOutdoor ? '#0047AB' : isDark ? '#60A5FA' : '#1B5CA2';
  const primaryAccent = isOutdoor ? '#0047AB' : '#1B5CA2';
  const warningAccent = isOutdoor ? '#92400E' : '#B45309';

  const [copiedSia, setCopiedSia] = useState<string | null>(null);
  const [selectedHistoryTicket, setSelectedHistoryTicket] = useState<MobileTicketItem | null>(null);
  const [historyPhotoState, setHistoryPhotoState] = useState<{
    status: 'idle' | 'loading' | 'loaded' | 'mock' | 'error';
    url: string | null;
    errorMessage: string | null;
  }>({ status: 'idle', url: null, errorMessage: null });
  const [photoImgLoadFailed, setPhotoImgLoadFailed] = useState(false);
  const [photoReloadTick, setPhotoReloadTick] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const themeWrapRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const historyTabRef = useRef<HTMLButtonElement>(null);
  const modalDialogRef = useRef<HTMLDivElement>(null);
  const modalCloseBtnRef = useRef<HTMLButtonElement>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);

  const openHistoryDetailModal = useCallback((ticket: MobileTicketItem, triggerEl?: HTMLElement | null) => {
    if (typeof document !== 'undefined') {
      modalTriggerRef.current =
        triggerEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    setSelectedHistoryTicket(ticket);
  }, []);

  const closeHistoryDetailModal = useCallback(() => {
    setSelectedHistoryTicket(null);
    const triggerEl = modalTriggerRef.current;
    modalTriggerRef.current = null;
    if (triggerEl && typeof triggerEl.focus === 'function') {
      setTimeout(() => {
        triggerEl.focus();
      }, 0);
    }
  }, []);

  const handleRequestLogout = () => {
    if (state.offlineQueueCount > 0 && !showLogoutConfirm) {
      setShowLogoutConfirm(true);
      return;
    }
    setShowLogoutConfirm(false);
    (props.onLogout || actions.logout)();
  };

  const currentThemePreference: MobileThemePreference =
    props.themePreference ?? (isDark ? 'dark' : 'light');

  const networkIndicator = useMemo(() => {
    const effectiveOffline = props.networkMode === 'offline' || !browserOnline;
    if (effectiveOffline) {
      return {
        label: 'Offline',
        color: isOutdoor ? '#991B1B' : isDark ? '#FCA5A5' : '#B91C1C',
      };
    }
    if (props.networkMode === 'flaky' || state.offlineQueueCount > 0) {
      return {
        label: props.networkMode === 'flaky' ? 'Sinyal Lemah' : 'Antrean Lokal',
        color: isOutdoor ? '#78350F' : isDark ? '#FCD34D' : '#B45309',
      };
    }
    return {
      label: 'Online',
      color: isOutdoor ? '#14532D' : isDark ? '#4ADE80' : '#15803D',
    };
  }, [props.networkMode, browserOnline, state.offlineQueueCount, isOutdoor, isDark]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isThemeOpen || typeof document === 'undefined') return undefined;
    function handleClickOutside(e: MouseEvent) {
      if (themeWrapRef.current && !themeWrapRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsThemeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isThemeOpen]);

  useEffect(() => {
    if (!selectedHistoryTicket || typeof document === 'undefined') return undefined;
    const focusTimer = setTimeout(() => {
      modalCloseBtnRef.current?.focus();
    }, 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeHistoryDetailModal();
        return;
      }
      if (e.key === 'Tab' && modalDialogRef.current) {
        const focusables = modalDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedHistoryTicket, closeHistoryDetailModal]);

  useEffect(() => {
    const ticket = selectedHistoryTicket;
    const photoKey = ticket?.historyMeta?.photoObjectKey;
    setPhotoImgLoadFailed(false);

    if (!ticket || !photoKey) {
      setHistoryPhotoState({ status: 'idle', url: null, errorMessage: null });
      return undefined;
    }

    let cancelled = false;
    setHistoryPhotoState({ status: 'loading', url: null, errorMessage: null });

    void (async () => {
      try {
        const res = await props.apiClient.request<{
          key: string;
          url: string;
          isMockFallback: boolean;
        }>(
          `/api/v1/tech/media/presign?ticketId=${encodeURIComponent(ticket.id)}&key=${encodeURIComponent(photoKey)}`,
        );

        if (cancelled) return;

        if (!res.success || !res.data?.url) {
          setHistoryPhotoState({
            status: 'error',
            url: null,
            errorMessage: res.success
              ? 'Tautan foto OPM tidak tersedia.'
              : res.error?.message || 'Gagal memuat tautan bukti foto OPM.',
          });
          return;
        }

        if (!isSafeMediaPreviewUrl(res.data.url)) {
          setHistoryPhotoState({
            status: 'error',
            url: null,
            errorMessage: 'URL pratinjau media ditolak oleh kebijakan keamanan aplikasi.',
          });
          return;
        }

        if (res.data.isMockFallback) {
          setHistoryPhotoState({
            status: 'mock',
            url: res.data.url,
            errorMessage: 'Object storage MinIO lokal sedang nonaktif. Menampilkan referensi kunci arsip.',
          });
          return;
        }

        setHistoryPhotoState({
          status: 'loaded',
          url: res.data.url,
          errorMessage: null,
        });
      } catch {
        if (!cancelled) {
          setHistoryPhotoState({
            status: 'error',
            url: null,
            errorMessage: 'Koneksi tidak stabil untuk mengambil pratinjau foto OPM.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedHistoryTicket, props.apiClient, photoReloadTick]);

  // Extract unique ODP codes from current ticket set
  const availableOdps = useMemo(() => {
    const set = new Set<string>();
    const currentList = state.activeTab === 'ACTIVE' ? state.allTickets : state.allHistoryTickets;
    currentList.forEach((t) => {
      if (t.customer.splitterCode) {
        set.add(t.customer.splitterCode);
      }
    });
    return Array.from(set);
  }, [state.activeTab, state.allTickets, state.allHistoryTickets]);

  // Extract unique Customer names from current ticket set
  const availableCustomers = useMemo(() => {
    const set = new Set<string>();
    const currentList = state.activeTab === 'ACTIVE' ? state.allTickets : state.allHistoryTickets;
    currentList.forEach((t) => {
      if (t.customer.fullName) {
        set.add(t.customer.fullName);
      }
    });
    return Array.from(set);
  }, [state.activeTab, state.allTickets, state.allHistoryTickets]);

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
      setTimeout(() => {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText('').catch(() => undefined);
        }
      }, 30000);
    } catch (err) {
      console.warn('[TicketList] Gagal menyalin SIA:', err);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        flex: 1,
        boxSizing: 'border-box',
        padding: '16px 16px 36px',
        color: theme.textPrimary,
        background: isOutdoor ? '#FFFFFF' : isDark ? '#080E1A' : '#F8FAFC',
        fontFamily: theme.typography.fontFamily.sans,
        overflowX: 'clip',
      }}
    >
      <style>{`
        .fiberops-input:focus-visible {
          outline: 2px solid ${primaryAccent};
          outline-offset: 1px;
        }
        .fiberops-input {
          background-color: ${isOutdoor ? '#FFFFFF' : isDark ? '#10192D' : '#FFFFFF'} !important;
          color: ${isOutdoor ? '#000000' : isDark ? '#F8FAFC' : '#0F172A'} !important;
          color-scheme: ${isDark ? 'dark' : 'light'};
        }
        .fiberops-input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px ${isOutdoor ? '#FFFFFF' : isDark ? '#10192D' : '#FFFFFF'} inset !important;
          -webkit-text-fill-color: ${isOutdoor ? '#000000' : isDark ? '#F8FAFC' : '#0F172A'} !important;
        }
        .fiberops-theme-option:hover:not(.selected) {
          background: ${isOutdoor ? '#F3F4F6' : isDark ? '#1E293B' : '#F1F5F9'} !important;
          color: ${isOutdoor ? '#000000' : isDark ? '#F8FAFC' : '#0F172A'} !important;
        }
        .fiberops-theme-option:focus-visible {
          outline: 2px solid ${primaryAccent};
          outline-offset: -2px;
        }
        .fiberops-action-btn:active {
          transform: scale(0.98);
        }
        .fiberops-action-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .fiberops-action-btn:focus-visible {
          outline: 2px solid ${primaryAccent};
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
          borderBottom: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <img
            src="/assets/Lintasarta-Icon.svg"
            alt="Lintasarta"
            width={36}
            height={36}
            style={{ display: 'block', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: theme.textPrimary, lineHeight: 1.2 }}>
              {props.technicianName || 'Teknisi Lapangan'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: theme.textSecondary, fontWeight: 500 }}>
                Regional Palembang
              </span>
              <span style={{ color: theme.textMuted }} aria-hidden="true">|</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: networkIndicator.color,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '4px',
                    background: networkIndicator.color,
                    display: 'inline-block',
                  }}
                />
                {networkIndicator.label}
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Action Buttons (Theme Switcher + Sync + Logout) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <div
            ref={themeWrapRef}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
          >
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => setIsThemeOpen((prev) => !prev)}
              title={`Tema saat ini: ${
                currentThemePreference === 'system'
                  ? 'Sistem'
                  : currentThemePreference === 'dark'
                    ? 'Gelap'
                    : 'Terang'
              }. Klik untuk memilih tema.`}
              aria-label={`Pilih Tema Antarmuka (Aktif: ${
                currentThemePreference === 'system'
                  ? 'Sistem'
                  : currentThemePreference === 'dark'
                    ? 'Gelap'
                    : 'Terang'
              })`}
              aria-expanded={isThemeOpen}
              aria-haspopup="listbox"
              style={{
                width: '44px',
                height: '44px',
                minHeight: '44px',
                padding: 0,
                background: isOutdoor
                  ? '#FFFFFF'
                  : isDark
                    ? isThemeOpen
                      ? '#1E293B'
                      : '#020617'
                    : '#FFFFFF',
                border: isOutdoor
                  ? `2px solid ${isThemeOpen ? '#0047AB' : '#000000'}`
                  : `1px solid ${isThemeOpen ? '#2585D0' : isDark ? '#1E293B' : theme.border}`,
                borderRadius: '6px',
                color: isOutdoor
                  ? isThemeOpen
                    ? '#0047AB'
                    : '#000000'
                  : isDark
                    ? isThemeOpen
                      ? '#FDE047'
                      : '#F59E0B'
                    : isThemeOpen
                      ? '#0E5B92'
                      : theme.textSecondary,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ThemeOptionIcon
                icon={
                  currentThemePreference === 'system'
                    ? 'monitor'
                    : currentThemePreference === 'dark'
                      ? 'moon'
                      : 'sun'
                }
                size={17}
              />
            </button>

            {isThemeOpen && (
              <div
                role="listbox"
                aria-label="Pilihan Tema Antarmuka"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: '184px',
                  background: isOutdoor ? '#FFFFFF' : isDark ? '#0F172A' : '#FFFFFF',
                  border: isOutdoor
                    ? '2px solid #000000'
                    : `1px solid ${isDark ? '#1E293B' : '#DCE7F0'}`,
                  borderRadius: '8px',
                  boxShadow: isDark
                    ? '0 10px 25px -5px rgba(0, 0, 0, 0.6)'
                    : '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
                  padding: '4px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {THEME_OPTIONS.map((opt) => {
                  const isSelected = currentThemePreference === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`fiberops-theme-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        props.onChangeThemePreference?.(opt.value);
                        setIsThemeOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        minHeight: '44px',
                        padding: '8px 10px',
                        border: isOutdoor && isSelected ? '2px solid #0047AB' : 'none',
                        background: isSelected
                          ? isOutdoor
                            ? '#EFF6FF'
                            : isDark
                              ? '#1E3A5F'
                              : '#E0F2FE'
                          : 'transparent',
                        borderRadius: '6px',
                        color: isSelected
                          ? isOutdoor
                            ? '#0047AB'
                            : isDark
                              ? '#38BDF8'
                              : '#0369A1'
                          : isOutdoor
                            ? '#000000'
                            : isDark
                              ? '#CBD5E1'
                              : '#334155',
                        fontSize: '13px',
                        fontWeight: isSelected ? 700 : 500,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ThemeOptionIcon icon={opt.icon} size={15} />
                        <span>{opt.label}</span>
                      </span>
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: isOutdoor ? '#0047AB' : isDark ? '#38BDF8' : '#0284C7',
                            flexShrink: 0,
                          }}
                        >
                          <CheckIcon size={13} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="fiberops-action-btn"
            onClick={() => void actions.syncOfflineQueue()}
            disabled={state.isLoading || state.isSyncing}
            aria-label="Sinkronkan data tiket"
            title="Sinkronkan antrean dan data tiket"
            style={{
              width: '44px',
              height: '44px',
              minHeight: '44px',
              padding: 0,
              background: cardSurface,
              border: cardBorder,
              borderRadius: '6px',
              color: theme.textSecondary,
              cursor: state.isLoading || state.isSyncing ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className={state.isLoading || state.isSyncing ? 'animate-spin-icon' : ''}>
              <SyncIcon size={16} color={theme.textSecondary} />
            </span>
          </button>

          <button
            type="button"
            className="fiberops-action-btn"
            onClick={handleRequestLogout}
            aria-label="Keluar dari akun teknisi"
            title="Keluar dari akun teknisi"
            style={{
              width: '44px',
              height: '44px',
              minHeight: '44px',
              padding: 0,
              background: cardSurface,
              border: isOutdoor
                ? '2px solid #991B1B'
                : `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA'}`,
              borderRadius: '6px',
              color: isOutdoor ? '#991B1B' : isDark ? '#F87171' : '#B91C1C',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogOutIcon size={16} color={isOutdoor ? '#991B1B' : isDark ? '#F87171' : '#B91C1C'} />
          </button>
        </div>
      </header>

      {/* Accidental Logout Guard Banner when Offline Queue has Pending Reports */}
      {showLogoutConfirm && state.offlineQueueCount > 0 && (
        <div
          role="alertdialog"
          aria-label="Konfirmasi keluar saat antrean offline belum terkirim"
          style={{
            background: isOutdoor ? '#FFFFFF' : isDark ? '#2A1215' : '#FEF2F2',
            border: isOutdoor ? '2px solid #991B1B' : `1px solid ${isDark ? '#EF4444' : '#FECACA'}`,
            borderRadius: '6px',
            padding: '12px 14px',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: isOutdoor ? '#991B1B' : isDark ? '#FCA5A5' : '#991B1B' }}>
            Masih ada {state.offlineQueueCount} laporan offline yang belum disinkronkan ke server. Keluar sekarang akan menghapus antrean lokal.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => setShowLogoutConfirm(false)}
              style={{
                minHeight: '44px',
                padding: '6px 14px',
                background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#FFFFFF',
                color: theme.textPrimary,
                border: cardBorder,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              className="fiberops-action-btn"
              onClick={() => {
                setShowLogoutConfirm(false);
                (props.onLogout || actions.logout)();
              }}
              style={{
                minHeight: '44px',
                padding: '6px 14px',
                background: isOutdoor ? '#991B1B' : '#B91C1C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Tetap Keluar
            </button>
          </div>
        </div>
      )}

      {/* Sticky Offline Queue Sync Banner */}
      {state.offlineQueueCount > 0 && (
        <div
          role="status"
          style={{
            background: isOutdoor ? '#FEF3C7' : isDark ? '#1C150A' : '#FEF3C7',
            border: isOutdoor ? '2px solid #78350F' : `1px solid ${isDark ? '#F59E0B' : '#FCD34D'}`,
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
            <div style={{ fontSize: '12px', fontWeight: 700, color: isOutdoor ? '#78350F' : isDark ? '#FBBF24' : '#92400E' }}>
              Antrean Offline ({state.offlineQueueCount} Laporan)
            </div>
            <div style={{ fontSize: '11px', color: isOutdoor ? '#78350F' : isDark ? '#FCD34D' : '#92400E', marginTop: '1px' }}>
              Tersimpan lokal, siap dikirim saat sinyal stabil.
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
              background: warningAccent,
              color: '#FFFFFF',
              border: isOutdoor ? '2px solid #000000' : 'none',
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

      {/* Segmented Tab Control: Tugas Aktif | Riwayat Selesai */}
      <div
        role="tablist"
        aria-label="Pilihan Jenis Tugas"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const nextTab = state.activeTab === 'ACTIVE' ? 'HISTORY' : 'ACTIVE';
            actions.setActiveTab(nextTab);
            if (nextTab === 'ACTIVE') {
              activeTabRef.current?.focus();
            } else {
              historyTabRef.current?.focus();
            }
          } else if (e.key === 'Home') {
            e.preventDefault();
            actions.setActiveTab('ACTIVE');
            activeTabRef.current?.focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            actions.setActiveTab('HISTORY');
            historyTabRef.current?.focus();
          }
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: isOutdoor ? '#FFFFFF' : isDark ? '#10192D' : '#E2E8F0',
          border: isOutdoor ? '2px solid #000000' : 'none',
          padding: '4px',
          borderRadius: '8px',
          gap: '4px',
          marginBottom: '14px',
        }}
      >
        <button
          ref={activeTabRef}
          id="tab-active"
          type="button"
          role="tab"
          aria-selected={state.activeTab === 'ACTIVE'}
          aria-controls="panel-tickets"
          tabIndex={state.activeTab === 'ACTIVE' ? 0 : -1}
          onClick={() => actions.setActiveTab('ACTIVE')}
          className="fiberops-action-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 10px',
            minHeight: '44px',
            borderRadius: '6px',
            border: isOutdoor && state.activeTab === 'ACTIVE' ? '2px solid #000000' : 'none',
            background:
              state.activeTab === 'ACTIVE'
                ? isOutdoor
                  ? '#000000'
                  : isDark
                    ? '#1E293B'
                    : '#FFFFFF'
                : 'transparent',
            color:
              state.activeTab === 'ACTIVE'
                ? isOutdoor
                  ? '#FFFFFF'
                  : isDark
                    ? '#FFFFFF'
                    : '#0F172A'
                : theme.textSecondary,
            fontWeight: state.activeTab === 'ACTIVE' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow:
              state.activeTab === 'ACTIVE' && !isOutdoor
                ? isDark
                  ? '0 1px 3px rgba(0,0,0,0.4)'
                  : '0 1px 3px rgba(15,23,42,0.1)'
                : 'none',
          }}
        >
          <span>Tugas Aktif</span>
          <span
            style={{
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background:
                state.activeTab === 'ACTIVE'
                  ? primaryAccent
                  : isOutdoor
                    ? '#F3F4F6'
                    : isDark
                      ? '#1E293B'
                      : '#CBD5E1',
              color:
                state.activeTab === 'ACTIVE'
                  ? '#FFFFFF'
                  : isOutdoor
                    ? '#000000'
                    : theme.textPrimary,
              border: isOutdoor && state.activeTab !== 'ACTIVE' ? '1px solid #000000' : 'none',
            }}
          >
            {state.totalTicketsCount}
          </span>
        </button>

        <button
          ref={historyTabRef}
          id="tab-history"
          type="button"
          role="tab"
          aria-selected={state.activeTab === 'HISTORY'}
          aria-controls="panel-tickets"
          tabIndex={state.activeTab === 'HISTORY' ? 0 : -1}
          onClick={() => actions.setActiveTab('HISTORY')}
          className="fiberops-action-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 10px',
            minHeight: '44px',
            borderRadius: '6px',
            border: isOutdoor && state.activeTab === 'HISTORY' ? '2px solid #000000' : 'none',
            background:
              state.activeTab === 'HISTORY'
                ? isOutdoor
                  ? '#000000'
                  : isDark
                    ? '#1E293B'
                    : '#FFFFFF'
                : 'transparent',
            color:
              state.activeTab === 'HISTORY'
                ? isOutdoor
                  ? '#FFFFFF'
                  : isDark
                    ? '#FFFFFF'
                    : '#0F172A'
                : theme.textSecondary,
            fontWeight: state.activeTab === 'HISTORY' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow:
              state.activeTab === 'HISTORY' && !isOutdoor
                ? isDark
                  ? '0 1px 3px rgba(0,0,0,0.4)'
                  : '0 1px 3px rgba(15,23,42,0.1)'
                : 'none',
          }}
        >
          <span>Riwayat Selesai</span>
          <span
            style={{
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background:
                state.activeTab === 'HISTORY'
                  ? isOutdoor
                    ? '#14532D'
                    : isDark
                      ? '#065F46'
                      : '#15803D'
                  : isOutdoor
                    ? '#F3F4F6'
                    : isDark
                      ? '#1E293B'
                      : '#CBD5E1',
              color:
                state.activeTab === 'HISTORY'
                  ? '#FFFFFF'
                  : isOutdoor
                    ? '#000000'
                    : theme.textPrimary,
              border: isOutdoor && state.activeTab !== 'HISTORY' ? '1px solid #000000' : 'none',
            }}
          >
            {state.totalHistoryCount}
          </span>
        </button>
      </div>

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
            height: '44px',
            minHeight: '44px',
            padding: '0 12px',
            background: state.isFilterActive
              ? isOutdoor
                ? '#0047AB'
                : isDark
                  ? '#1E3A8A'
                  : '#DBEAFE'
              : cardSurface,
            border: isOutdoor
              ? '2px solid #000000'
              : `1px solid ${state.isFilterActive ? '#1B5CA2' : theme.border}`,
            borderRadius: '6px',
            color: state.isFilterActive
              ? isOutdoor
                ? '#FFFFFF'
                : isDark
                  ? '#93C5FD'
                  : '#1D4ED8'
              : theme.textSecondary,
            fontSize: '13px',
            fontWeight: 700,
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
              aria-hidden="true"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '4px',
                background: isOutdoor ? '#FFFFFF' : isDark ? '#93C5FD' : '#1B5CA2',
                display: 'inline-block',
              }}
            />
          )}
        </button>

        {/* Center Search Input Box */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
            aria-label={
              state.activeTab === 'ACTIVE'
                ? 'Cari tugas aktif'
                : 'Cari riwayat selesai'
            }
            placeholder={
              state.activeTab === 'ACTIVE'
                ? 'Cari no. tiket, pelanggan, ODP, SIA...'
                : 'Cari riwayat no. tiket, pelanggan, ODP, SIA...'
            }
            style={{
              width: '100%',
              height: '44px',
              minHeight: '44px',
              padding: '0 12px 0 34px',
              fontSize: '13px',
              background: cardSurface,
              color: theme.textPrimary,
              border: cardBorder,
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
            width: '44px',
            height: '44px',
            minHeight: '44px',
            padding: 0,
            background: cardSurface,
            border: cardBorder,
            borderRadius: '6px',
            color: state.isFilterActive
              ? isOutdoor
                ? '#991B1B'
                : isDark
                  ? '#FCA5A5'
                  : '#B91C1C'
              : theme.textMuted,
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
            background: cardSurface,
            border: cardBorder,
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
              borderBottom: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
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
                color: linkColor,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: '44px',
                padding: '6px 8px',
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
                      minHeight: '44px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: isOutdoor
                        ? `2px solid ${isSelected ? '#0047AB' : '#000000'}`
                        : `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                      background: isSelected
                        ? primaryAccent
                        : isOutdoor
                          ? '#FFFFFF'
                          : isDark
                            ? '#080E1A'
                            : '#F1F5F9',
                      color: isSelected ? '#FFFFFF' : theme.textPrimary,
                      fontSize: '12px',
                      fontWeight: isSelected ? 700 : 600,
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
                    minHeight: '44px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: isOutdoor
                      ? `2px solid ${state.filterOdp === 'ALL' ? '#0047AB' : '#000000'}`
                      : `1px solid ${state.filterOdp === 'ALL' ? '#1B5CA2' : theme.border}`,
                    background: state.filterOdp === 'ALL' ? primaryAccent : isOutdoor ? '#FFFFFF' : isDark ? '#080E1A' : '#F1F5F9',
                    color: state.filterOdp === 'ALL' ? '#FFFFFF' : theme.textPrimary,
                    fontSize: '12px',
                    fontWeight: state.filterOdp === 'ALL' ? 700 : 600,
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
                        minHeight: '44px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: isOutdoor
                          ? `2px solid ${isSelected ? '#0047AB' : '#000000'}`
                          : `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                        background: isSelected ? primaryAccent : isOutdoor ? '#FFFFFF' : isDark ? '#080E1A' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : theme.textPrimary,
                        fontSize: '12px',
                        fontWeight: isSelected ? 700 : 600,
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
                    minHeight: '44px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: isOutdoor
                      ? `2px solid ${state.filterCustomer === 'ALL' ? '#0047AB' : '#000000'}`
                      : `1px solid ${state.filterCustomer === 'ALL' ? '#1B5CA2' : theme.border}`,
                    background: state.filterCustomer === 'ALL' ? primaryAccent : isOutdoor ? '#FFFFFF' : isDark ? '#080E1A' : '#F1F5F9',
                    color: state.filterCustomer === 'ALL' ? '#FFFFFF' : theme.textPrimary,
                    fontSize: '12px',
                    fontWeight: state.filterCustomer === 'ALL' ? 700 : 600,
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
                        minHeight: '44px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: isOutdoor
                          ? `2px solid ${isSelected ? '#0047AB' : '#000000'}`
                          : `1px solid ${isSelected ? '#1B5CA2' : theme.border}`,
                        background: isSelected ? primaryAccent : isOutdoor ? '#FFFFFF' : isDark ? '#080E1A' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : theme.textPrimary,
                        fontSize: '12px',
                        fontWeight: isSelected ? 700 : 600,
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
                minHeight: '44px',
                padding: '8px 16px',
                background: primaryAccent,
                color: '#FFFFFF',
                border: isOutdoor ? '2px solid #000000' : 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
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
            themeMode={themeMode}
          />
        </div>
      )}

      {/* Ticket List Cards Container */}
      <div
        role="tabpanel"
        id="panel-tickets"
        aria-labelledby={state.activeTab === 'ACTIVE' ? 'tab-active' : 'tab-history'}
      >
      {state.activeTab === 'ACTIVE' ? (
        state.isLoading && state.tickets.length === 0 ? (
          <div
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              background: cardSurface,
              border: cardBorder,
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
              actionLabel="Reset Filter"
              onAction={() => actions.resetAllFilters()}
              actionVariant="secondary"
              themeMode={themeMode}
            />
          ) : (
            <EmptyState
              icon="ticket"
              title="Belum Ada Tiket Ditugaskan"
              description="Saat ini belum ada tiket kerja lapangan aktif untuk Anda. Tekan tombol muat ulang untuk mengambil data terbaru."
              actionLabel="Muat Ulang Data"
              onAction={() => void actions.refresh()}
              actionVariant="primary"
              themeMode={themeMode}
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
              const statusStyle = getStatusBadgeStyle(ticket.status, themeMode);

              return (
                <article
                  key={ticket.id}
                  style={{
                    background: cardSurface,
                    border: cardBorder,
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
                        fontWeight: 700,
                        color: statusStyle.color,
                        background: statusStyle.bg,
                        border: isOutdoor ? `2px solid ${statusStyle.border}` : `1px solid ${statusStyle.border}`,
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
                        background: isMaintenance ? warningAccent : primaryAccent,
                      }}
                    >
                      {isMaintenance ? 'Gangguan' : 'Pasang Baru'}
                    </span>

                    {/* Telemetri Redaman (Optical Telemetry) */}
                    {ticket.customer.currentAttenuation !== null &&
                      ticket.customer.currentAttenuation !== undefined && (
                        <div style={{ flexShrink: 0 }}>
                          {(() => {
                            const telemetry = formatOpticalTelemetryDbm(
                              ticket.customer.currentAttenuation,
                              themeMode,
                            );
                            return (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 6px',
                                  background: telemetry.bg,
                                  border: isOutdoor
                                    ? `2px solid ${telemetry.border}`
                                    : `1px solid ${telemetry.border}`,
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
                        background: isOutdoor ? '#FFFFFF' : isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                        border: isOutdoor ? '2px solid #991B1B' : `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA'}`,
                        borderRadius: '4px',
                        color: isOutdoor ? '#991B1B' : isDark ? '#FCA5A5' : '#B91C1C',
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

                    <span style={{ color: theme.textMuted }} aria-hidden="true">|</span>

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
                        gap: '4px',
                        minHeight: '44px',
                        padding: '0 10px',
                        background:
                          copiedSia === ticket.customer.siaNumber
                            ? isOutdoor
                              ? '#14532D'
                              : isDark
                                ? '#065F46'
                                : '#15803D'
                            : isOutdoor
                              ? '#FFFFFF'
                              : isDark
                                ? '#1E293B'
                                : '#F1F5F9',
                        color:
                          copiedSia === ticket.customer.siaNumber ? '#FFFFFF' : theme.textPrimary,
                        border: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedSia === ticket.customer.siaNumber ? (
                        <>
                          <CheckIcon size={11} color="#FFFFFF" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon size={11} color="currentColor" />
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
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '44px',
                      fontSize: '12px',
                      color: theme.textSecondary,
                      lineHeight: 1.4,
                      marginBottom: ticket.complaintSummary ? '6px' : '10px',
                      textDecoration: 'none',
                    }}
                    title="Buka navigasi Google Maps"
                  >
                    <MapPinIcon size={14} color={linkColor} style={{ flexShrink: 0 }} />
                    <span>
                      {ticket.locationPlace ? `${ticket.locationPlace} | ` : ''}
                      {ticket.serviceAddress || ticket.customer.address}
                    </span>
                  </a>

                  {/* Keluhan / Catatan jika tersedia */}
                  {ticket.complaintSummary && (
                    <div
                      style={{
                        background: insetSurface,
                        border: cardBorder,
                        borderRadius: '4px',
                        padding: '8px 10px',
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
                        href={`tel:${ticket.customerPhone.replace(/[^\d+]/g, '')}`}
                        className="fiberops-action-btn"
                        aria-label={`Hubungi telepon pelanggan ${ticket.customer.fullName}`}
                        title={`Hubungi: ${ticket.customerPhone}`}
                        style={{
                          width: '46px',
                          height: '44px',
                          minHeight: '44px',
                          padding: 0,
                          background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#F1F5F9',
                          color: theme.textPrimary,
                          border: isOutdoor ? '2px solid #000000' : `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
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
                          height: '44px',
                          minHeight: '44px',
                          padding: 0,
                          background: isOutdoor ? '#F3F4F6' : isDark ? '#1E293B' : '#F1F5F9',
                          color: theme.textMuted,
                          border: isOutdoor ? '2px solid #000000' : `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.55,
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
                        height: '44px',
                        minHeight: '44px',
                        padding: '0 16px',
                        background: primaryAccent,
                        color: '#FFFFFF',
                        border: isOutdoor ? '2px solid #000000' : 'none',
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
        )
      ) : (
        /* Riwayat Selesai Tab */
        state.isLoading && state.historyTickets.length === 0 ? (
          <div
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              background: cardSurface,
              border: cardBorder,
              borderRadius: '8px',
              color: theme.textSecondary,
              fontSize: '13px',
            }}
          >
            Memuat daftar riwayat tugas selesai...
          </div>
        ) : state.historyTickets.length === 0 ? (
          state.isFilterActive ? (
            <EmptyState
              icon="search"
              title="Tidak Ada Riwayat yang Sesuai"
              description="Tidak ditemukan riwayat pekerjaan yang sesuai dengan pencarian atau opsi filter yang dipilih."
              actionLabel="Reset Filter"
              onAction={() => actions.resetAllFilters()}
              actionVariant="secondary"
              themeMode={themeMode}
            />
          ) : (
            <EmptyState
              icon="inbox"
              title="Belum Ada Riwayat Selesai"
              description="Daftar tugas yang telah tuntas Anda selesaikan dan disetujui admin akan tersimpan dan tampil di sini."
              actionLabel="Muat Ulang Data"
              onAction={() => void actions.refresh()}
              actionVariant="primary"
              themeMode={themeMode}
            />
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textSecondary,
                padding: '4px 2px',
              }}
            >
              {state.historyTotalCount > state.allHistoryTickets.length
                ? `Menampilkan ${state.historyTickets.length} dari ${state.historyLimit} riwayat terbaru (total ${state.historyTotalCount} selesai).`
                : `Menampilkan ${state.historyTickets.length} riwayat tugas selesai (maksimal ${state.historyLimit} riwayat terakhir).`}
            </div>
            {state.historyTickets.map((ticket) => {
              const targetLat = ticket.targetLat ?? ticket.customer.lat;
              const targetLng = ticket.targetLng ?? ticket.customer.lng;
              const mapsUrl =
                targetLat !== null && targetLng !== null
                  ? `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      ticket.serviceAddress || ticket.customer.address,
                    )}`;

              const isMaintenance = ticket.ticketType === 'MAINTENANCE';
              const completedStatusStyle = getStatusBadgeStyle('COMPLETED', themeMode);
              const completionTimestamp = ticket.completedAt || ticket.historyMeta?.approvedAt;

              return (
                <article
                  key={ticket.id}
                  style={{
                    background: cardSurface,
                    border: cardBorder,
                    borderRadius: '8px',
                    padding: '12px 14px',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* 1. Bagian Atas: Nama Pelanggan + #WO-... */}
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

                  {/* 2. Dibawah Nama: Badge SELESAI + Jenis Tiket + Telemetri Redaman */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    {/* Status Badge SELESAI */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: completedStatusStyle.color,
                        background: completedStatusStyle.bg,
                        border: isOutdoor
                          ? `2px solid ${completedStatusStyle.border}`
                          : `1px solid ${completedStatusStyle.border}`,
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      SELESAI
                    </span>

                    {/* Jenis Tiket Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: '#FFFFFF',
                        background: isMaintenance ? warningAccent : primaryAccent,
                      }}
                    >
                      {isMaintenance ? 'Gangguan' : 'Pasang Baru'}
                    </span>

                    {/* Telemetri Redaman Akhir */}
                    {ticket.customer.currentAttenuation !== null &&
                      ticket.customer.currentAttenuation !== undefined && (
                        <div style={{ flexShrink: 0 }}>
                          {(() => {
                            const telemetry = formatOpticalTelemetryDbm(
                              ticket.customer.currentAttenuation,
                              themeMode,
                            );
                            return (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 6px',
                                  background: telemetry.bg,
                                  border: isOutdoor
                                    ? `2px solid ${telemetry.border}`
                                    : `1px solid ${telemetry.border}`,
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

                  {/* Tanggal & Jam Penyelesaian WIB + Persetujuan Admin */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      fontSize: '11px',
                      color: theme.textSecondary,
                    }}
                  >
                    <span>
                      <strong style={{ fontWeight: 600 }}>Tuntas:</strong>{' '}
                      <span
                        style={{
                          fontFamily: theme.typography.fontFamily.mono,
                          color: theme.textPrimary,
                          fontWeight: 600,
                        }}
                      >
                        {formatWibDateTime(completionTimestamp)}
                      </span>
                    </span>
                    {ticket.createdByAdmin && (
                      <span>
                        <strong style={{ fontWeight: 600 }}>Dari Admin:</strong>{' '}
                        <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
                          {ticket.createdByAdmin.fullName}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* ODP, Port, SIA */}
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
                      {ticket.customer.splitterCode || '-'}
                    </span>

                    {ticket.customer.portNumber !== null &&
                      ticket.customer.portNumber !== undefined && (
                      <>
                        <span style={{ color: theme.textMuted }} aria-hidden="true">|</span>
                        <span style={{ color: theme.textSecondary }}>Port:</span>
                        <span style={{ color: theme.textPrimary, fontWeight: 700 }}>
                          {ticket.customer.portNumber}
                        </span>
                      </>
                    )}

                    <span style={{ color: theme.textMuted }} aria-hidden="true">|</span>

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
                        gap: '4px',
                        minHeight: '44px',
                        padding: '0 10px',
                        background:
                          copiedSia === ticket.customer.siaNumber
                            ? isOutdoor
                              ? '#14532D'
                              : isDark
                                ? '#065F46'
                                : '#15803D'
                            : isOutdoor
                              ? '#FFFFFF'
                              : isDark
                                ? '#1E293B'
                                : '#F1F5F9',
                        color:
                          copiedSia === ticket.customer.siaNumber ? '#FFFFFF' : theme.textPrimary,
                        border: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedSia === ticket.customer.siaNumber ? (
                        <>
                          <CheckIcon size={11} color="#FFFFFF" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon size={11} color="currentColor" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Alamat Lengkap & Maps */}
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '44px',
                      fontSize: '12px',
                      color: theme.textSecondary,
                      lineHeight: 1.4,
                      marginBottom: '10px',
                      textDecoration: 'none',
                    }}
                    title="Buka navigasi Google Maps"
                  >
                    <MapPinIcon size={14} color={linkColor} style={{ flexShrink: 0 }} />
                    <span>
                      {ticket.locationPlace ? `${ticket.locationPlace} | ` : ''}
                      {ticket.serviceAddress || ticket.customer.address}
                    </span>
                  </a>

                  {/* Bottom Actions: Call + Lihat Detail */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {ticket.customerPhone ? (
                      <a
                        href={`tel:${ticket.customerPhone.replace(/[^\d+]/g, '')}`}
                        className="fiberops-action-btn"
                        aria-label={`Hubungi telepon pelanggan ${ticket.customer.fullName}`}
                        title={`Hubungi: ${ticket.customerPhone}`}
                        style={{
                          width: '46px',
                          height: '44px',
                          minHeight: '44px',
                          padding: 0,
                          background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#F1F5F9',
                          color: theme.textPrimary,
                          border: isOutdoor ? '2px solid #000000' : `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
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
                    ) : null}

                    <button
                      type="button"
                      className="fiberops-action-btn"
                      onClick={(e) => openHistoryDetailModal(ticket, e.currentTarget)}
                      style={{
                        flex: 1,
                        height: '44px',
                        minHeight: '44px',
                        padding: '0 16px',
                        background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#F1F5F9',
                        color: theme.textPrimary,
                        border: isOutdoor ? '2px solid #000000' : `1px solid ${isDark ? theme.border : '#CBD5E1'}`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Lihat Detail Riwayat
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}
      </div>

      {/* Read-Only History Detail Modal */}
      {selectedHistoryTicket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-history-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100,
          }}
          onClick={closeHistoryDetailModal}
        >
          <div
            ref={modalDialogRef}
            style={{
              background: cardSurface,
              border: cardBorder,
              borderRadius: '8px',
              width: '100%',
              maxWidth: '420px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: isDark
                ? '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.5)'
                : '0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 10px 10px -5px rgba(15, 23, 42, 0.08)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
              }}
            >
              <div>
                <div
                  id="modal-history-title"
                  style={{
                    fontSize: '15px',
                    fontWeight: 800,
                    color: theme.textPrimary,
                    lineHeight: 1.2,
                  }}
                >
                  Detail Riwayat Pekerjaan
                </div>
                <div
                  style={{
                    fontFamily: theme.typography.fontFamily.mono,
                    fontSize: '12px',
                    color: theme.textSecondary,
                    marginTop: '2px',
                  }}
                >
                  #{selectedHistoryTicket.ticketNumber}
                </div>
              </div>

              <button
                ref={modalCloseBtnRef}
                type="button"
                className="fiberops-action-btn"
                onClick={closeHistoryDetailModal}
                aria-label="Tutup detail riwayat"
                style={{
                  background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#F1F5F9',
                  border: cardBorder,
                  borderRadius: '6px',
                  width: '44px',
                  height: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: theme.textPrimary,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <ClearIcon size={17} color="currentColor" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div
              style={{
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Status & Linimasa Penyelesaian (WIB) */}
              {(() => {
                const modalCompletedStyle = getStatusBadgeStyle('COMPLETED', themeMode);
                const completionTs =
                  selectedHistoryTicket.completedAt || selectedHistoryTicket.historyMeta?.approvedAt;
                return (
                  <div
                    style={{
                      background: insetSurface,
                      border: cardBorder,
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: modalCompletedStyle.color,
                          background: modalCompletedStyle.bg,
                          border: isOutdoor
                            ? `2px solid ${modalCompletedStyle.border}`
                            : `1px solid ${modalCompletedStyle.border}`,
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        SELESAI
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          color: '#FFFFFF',
                          background:
                            selectedHistoryTicket.ticketType === 'MAINTENANCE'
                              ? warningAccent
                              : primaryAccent,
                        }}
                      >
                        {selectedHistoryTicket.ticketType === 'MAINTENANCE'
                          ? 'Gangguan'
                          : 'Pasang Baru'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary }}>Diberikan Admin:</span>
                        <strong style={{ color: theme.textPrimary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'right' }}>
                          {formatWibDateTime(selectedHistoryTicket.assignedAt || selectedHistoryTicket.createdAt)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary }}>Mulai Kerja:</span>
                        <strong style={{ color: theme.textPrimary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'right' }}>
                          {formatWibDateTime(selectedHistoryTicket.startedAt)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary }}>Dikirim Teknisi:</span>
                        <strong style={{ color: theme.textPrimary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'right' }}>
                          {formatWibDateTime(selectedHistoryTicket.historyMeta?.submittedAt)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary }}>Disetujui Selesai:</span>
                        <strong style={{ color: theme.textPrimary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'right' }}>
                          {formatWibDateTime(completionTs)}
                        </strong>
                      </div>
                      {selectedHistoryTicket.historyMeta?.submissionChannel && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ color: theme.textSecondary }}>Kanal Laporan:</span>
                          <strong style={{ color: theme.textPrimary, fontFamily: theme.typography.fontFamily.mono }}>
                            {selectedHistoryTicket.historyMeta.submissionChannel}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Penugasan & Pelaksana */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Penugasan & Pelaksana
                </div>
                <div
                  style={{
                    background: insetSurface,
                    border: cardBorder,
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Admin Pemberi Tugas:</span>
                    <strong style={{ color: theme.textPrimary, textAlign: 'right' }}>
                      {selectedHistoryTicket.createdByAdmin
                        ? `${selectedHistoryTicket.createdByAdmin.fullName} (${selectedHistoryTicket.createdByAdmin.username})`
                        : '-'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Teknisi Pelaksana:</span>
                    <strong style={{ color: theme.textPrimary, textAlign: 'right' }}>
                      {selectedHistoryTicket.assignedTech?.fullName ||
                        props.technicianName ||
                        '-'}
                    </strong>
                  </div>

                  {(selectedHistoryTicket.assignedTech?.vendorCompany || selectedHistoryTicket.vendorName) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: theme.textSecondary }}>Mitra Vendor:</span>
                      <span style={{ color: theme.textPrimary, textAlign: 'right', fontWeight: 600 }}>
                        {selectedHistoryTicket.assignedTech?.vendorCompany || selectedHistoryTicket.vendorName}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Disetujui Oleh:</span>
                    <strong style={{ color: theme.textPrimary, textAlign: 'right', fontFamily: theme.typography.fontFamily.mono }}>
                      {selectedHistoryTicket.historyMeta?.approvedBy || '-'}
                    </strong>
                  </div>

                  {selectedHistoryTicket.adminNotes && (
                    <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: isOutdoor ? '1px solid #000000' : `1px solid ${theme.border}` }}>
                      <div style={{ color: theme.textSecondary, fontWeight: 700, marginBottom: '2px' }}>
                        Instruksi Admin:
                      </div>
                      <div style={{ color: theme.textPrimary, lineHeight: 1.4 }}>
                        {selectedHistoryTicket.adminNotes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Pelanggan & Lokasi */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Pelanggan & Lokasi
                </div>
                <div
                  style={{
                    background: insetSurface,
                    border: cardBorder,
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Nama:</span>
                    <strong style={{ color: theme.textPrimary, textAlign: 'right' }}>
                      {selectedHistoryTicket.customer.fullName}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>SIA:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontFamily: theme.typography.fontFamily.mono,
                          fontWeight: 700,
                          color: theme.textPrimary,
                        }}
                      >
                        {selectedHistoryTicket.customer.siaNumber}
                      </span>
                      <button
                        type="button"
                        className="fiberops-action-btn"
                        onClick={(e) => handleCopySia(e, selectedHistoryTicket.customer.siaNumber)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          minHeight: '44px',
                          padding: '0 10px',
                          background:
                            copiedSia === selectedHistoryTicket.customer.siaNumber
                              ? isOutdoor
                                ? '#14532D'
                                : isDark
                                  ? '#065F46'
                                  : '#15803D'
                              : cardSurface,
                          color:
                            copiedSia === selectedHistoryTicket.customer.siaNumber
                              ? '#FFFFFF'
                              : theme.textPrimary,
                          border: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {copiedSia === selectedHistoryTicket.customer.siaNumber ? (
                          <>
                            <CheckIcon size={11} color="#FFFFFF" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <CopyIcon size={11} color="currentColor" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {selectedHistoryTicket.customerPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: theme.textSecondary }}>Telepon:</span>
                      <a
                        href={`tel:${selectedHistoryTicket.customerPhone.replace(/[^\d+]/g, '')}`}
                        style={{
                          color: linkColor,
                          fontFamily: theme.typography.fontFamily.mono,
                          textDecoration: 'underline',
                          fontWeight: 700,
                          minHeight: '44px',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        {selectedHistoryTicket.customerPhone}
                      </a>
                    </div>
                  )}

                  {selectedHistoryTicket.locationPlace && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: theme.textSecondary }}>Lokasi / Patokan:</span>
                      <span style={{ color: theme.textPrimary, textAlign: 'right', maxWidth: '65%', fontWeight: 600 }}>
                        {selectedHistoryTicket.locationPlace}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Alamat:</span>
                    <span style={{ color: theme.textPrimary, textAlign: 'right', maxWidth: '65%' }}>
                      {selectedHistoryTicket.serviceAddress || selectedHistoryTicket.customer.address}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Cluster:</span>
                    <span style={{ color: theme.textPrimary, textAlign: 'right' }}>
                      {selectedHistoryTicket.customer.clusterName} ({selectedHistoryTicket.customer.clusterCode})
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <a
                      href={
                        (selectedHistoryTicket.targetLat ?? selectedHistoryTicket.customer.lat) !== null &&
                        (selectedHistoryTicket.targetLng ?? selectedHistoryTicket.customer.lng) !== null
                          ? `https://www.google.com/maps/dir/?api=1&destination=${selectedHistoryTicket.targetLat ?? selectedHistoryTicket.customer.lat},${selectedHistoryTicket.targetLng ?? selectedHistoryTicket.customer.lng}`
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedHistoryTicket.serviceAddress || selectedHistoryTicket.customer.address)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        minHeight: '44px',
                        color: linkColor,
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'underline',
                      }}
                    >
                      <MapPinIcon size={14} color={linkColor} />
                      <span>Buka Rute Google Maps</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Infrastruktur, Redaman & Catatan Kerja Teknisi */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Infrastruktur & Hasil Kerja
                </div>
                <div
                  style={{
                    background: insetSurface,
                    border: cardBorder,
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>ODP Splitter:</span>
                    <span
                      style={{
                        fontFamily: theme.typography.fontFamily.mono,
                        fontWeight: 700,
                        color: theme.textPrimary,
                      }}
                    >
                      {selectedHistoryTicket.customer.splitterCode || '-'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>Port Terpasang:</span>
                    <span
                      style={{
                        fontFamily: theme.typography.fontFamily.mono,
                        fontWeight: 700,
                        color: theme.textPrimary,
                      }}
                    >
                      {selectedHistoryTicket.customer.portNumber !== null &&
                      selectedHistoryTicket.customer.portNumber !== undefined
                        ? `Port ${selectedHistoryTicket.customer.portNumber}`
                        : '-'}
                    </span>
                  </div>

                  {selectedHistoryTicket.historyMeta?.oldAttenuation !== null &&
                    selectedHistoryTicket.historyMeta?.oldAttenuation !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textSecondary }}>Redaman Awal:</span>
                        {(() => {
                          const oldTel = formatOpticalTelemetryDbm(
                            selectedHistoryTicket.historyMeta?.oldAttenuation,
                            themeMode,
                          );
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 6px',
                                background: oldTel.bg,
                                border: isOutdoor ? `2px solid ${oldTel.border}` : `1px solid ${oldTel.border}`,
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: oldTel.color,
                                fontFamily: theme.typography.fontFamily.mono,
                              }}
                            >
                              {oldTel.label}
                            </span>
                          );
                        })()}
                      </div>
                    )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Redaman Akhir:</span>
                    {(() => {
                      const finalAtt =
                        selectedHistoryTicket.historyMeta?.newAttenuation ??
                        selectedHistoryTicket.customer.currentAttenuation;
                      if (finalAtt === null || finalAtt === undefined) {
                        return <span style={{ color: theme.textMuted }}>-</span>;
                      }
                      const telemetry = formatOpticalTelemetryDbm(finalAtt, themeMode);
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: telemetry.bg,
                            border: isOutdoor ? `2px solid ${telemetry.border}` : `1px solid ${telemetry.border}`,
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

                  {selectedHistoryTicket.historyMeta?.technicianNotes && (
                    <div style={{ marginTop: '2px', paddingTop: '6px', borderTop: isOutdoor ? '1px solid #000000' : `1px solid ${theme.border}` }}>
                      <div style={{ color: theme.textSecondary, fontWeight: 700, marginBottom: '2px' }}>
                        Catatan Teknisi:
                      </div>
                      <div style={{ color: theme.textPrimary, lineHeight: 1.4 }}>
                        {selectedHistoryTicket.historyMeta.technicianNotes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ringkasan Keluhan */}
              {selectedHistoryTicket.complaintSummary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: theme.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Ringkasan Keluhan
                  </div>
                  <div
                    style={{
                      background: insetSurface,
                      border: cardBorder,
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: theme.textPrimary,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedHistoryTicket.complaintSummary}
                  </div>
                </div>
              )}

              {/* Bukti Foto OPM */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: theme.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Bukti Foto OPM
                </div>
                <div
                  style={{
                    background: insetSurface,
                    border: cardBorder,
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                  }}
                >
                  {!selectedHistoryTicket.historyMeta?.photoObjectKey ? (
                    <div>Belum ada lampiran foto OPM pada arsip tiket ini.</div>
                  ) : historyPhotoState.status === 'loading' ? (
                    <div>Memuat pratinjau foto bukti OPM...</div>
                  ) : historyPhotoState.status === 'loaded' &&
                    historyPhotoState.url &&
                    !photoImgLoadFailed ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <img
                        src={historyPhotoState.url}
                        alt={`Bukti pengukuran OPM tiket ${selectedHistoryTicket.ticketNumber}`}
                        onError={() => setPhotoImgLoadFailed(true)}
                        style={{
                          width: '100%',
                          maxHeight: '220px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: cardBorder,
                        }}
                      />
                      <a
                        href={historyPhotoState.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          minHeight: '44px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: linkColor,
                          fontWeight: 700,
                          textDecoration: 'underline',
                        }}
                      >
                        Buka foto ukuran penuh
                      </a>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ color: theme.textPrimary, fontWeight: 600 }}>
                        {photoImgLoadFailed
                          ? 'File gambar bukti OPM tidak dapat dimuat dari penyimpanan.'
                          : historyPhotoState.errorMessage ||
                            'Pratinjau foto OPM belum tersedia saat ini.'}
                      </div>
                      <div
                        style={{
                          fontFamily: theme.typography.fontFamily.mono,
                          fontSize: '11px',
                          color: theme.textMuted,
                          wordBreak: 'break-all',
                        }}
                      >
                        Kunci arsip: {selectedHistoryTicket.historyMeta.photoObjectKey}
                      </div>
                      {(historyPhotoState.status === 'error' || photoImgLoadFailed) && (
                        <button
                          type="button"
                          className="fiberops-action-btn"
                          onClick={() => setPhotoReloadTick((prev) => prev + 1)}
                          style={{
                            alignSelf: 'flex-start',
                            minHeight: '44px',
                            padding: '6px 12px',
                            background: cardSurface,
                            color: theme.textPrimary,
                            border: cardBorder,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Muat Ulang Foto
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
                background: insetSurface,
              }}
            >
              <button
                type="button"
                className="fiberops-action-btn"
                onClick={closeHistoryDetailModal}
                style={{
                  width: '100%',
                  height: '44px',
                  minHeight: '44px',
                  background: isOutdoor ? '#FFFFFF' : isDark ? '#1E293B' : '#E2E8F0',
                  color: theme.textPrimary,
                  border: isOutdoor ? '2px solid #000000' : `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
