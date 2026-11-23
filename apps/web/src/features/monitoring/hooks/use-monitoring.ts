'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { fetchWithCache, getCachedData } from '@/lib/query-cache';
import { useToast } from '@/providers';
import {
  classifyMonitoringDbm,
  getSpectrumMeterPercentage,
  isAttenuationMeasured,
  matchesClusterSelection,
  type LiveReportItem,
  type MonitoringTab,
} from '../utils/monitoring-telemetry';

export type { LiveReportItem, MonitoringTab };

const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const SSE_SYNC_DEBOUNCE_MS = 1200;
const MAX_RECONNECT_DELAY_MS = 30000;

export type SseState = 'CONNECTING' | 'LIVE_CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

interface IncomingSseReportPayload {
  id?: string;
  ticketNumber?: string;
  title?: string;
  customerName?: string;
  siaNumber?: string;
  clusterName?: string;
  clusterCode?: string;
  technicianName?: string;
  techInitials?: string;
  attenuationDbm?: number | string;
  type?: string;
  splitterCode?: string;
  portNumber?: number | string;
  distanceMeters?: number | string;
  isLocationFlagged?: boolean;
}

function formatWibClock(date: Date): string {
  return (
    date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB'
  );
}

function pickInitialReport(items: LiveReportItem[] | null): LiveReportItem | null {
  if (!items || items.length === 0) return null;
  const critical = items.find((r) => classifyMonitoringDbm(r.currentAttenuation) === 'Critical');
  return critical || items[0];
}

function inferSseStatus(
  title: string | undefined,
  existingStatus: LiveReportItem['status'] | undefined,
): LiveReportItem['status'] {
  const lower = (title || '').toLowerCase();
  if (lower.includes('menunggu verifikasi')) return 'Menunggu verifikasi';
  if (lower.includes('disetujui') || lower.includes('selesai')) return 'Selesai';
  if (lower.includes('ditolak') || lower.includes('proses')) return 'Dalam proses';
  return existingStatus ?? 'Dalam proses';
}

function inferTicketType(
  rawType: string | undefined,
  existingType: LiveReportItem['ticketType'] | undefined,
): LiveReportItem['ticketType'] {
  if (rawType === 'Pasang baru') return 'Pasang baru';
  if (rawType === 'Maintenance') return 'Maintenance';
  if (rawType === 'Perbaikan') return 'Perbaikan';
  if (rawType === 'Instalasi') return 'Instalasi';
  return existingType ?? 'Maintenance';
}

export function useMonitoring() {
  const [tab, setTab] = useState<MonitoringTab>('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [typeFilter, setTypeFilter] = useState('Semua tipe');
  const [techFilter, setTechFilter] = useState('Semua teknisi');
  const [reports, setReports] = useState<LiveReportItem[]>(
    () => getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selectedTicket, setSelectedTicket] = useState<LiveReportItem | null>(() =>
    pickInitialReport(getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY)),
  );
  const [modalTicket, setModalTicket] = useState<LiveReportItem | null>(null);
  const [sseState, setSseState] = useState<SseState>('CONNECTING');
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('Menunggu sinkronisasi...');
  const [autoFollowLive, setAutoFollowLive] = useState(false);
  const [pendingLiveUpdates, setPendingLiveUpdates] = useState(0);
  const [latestLiveTicketNumber, setLatestLiveTicketNumber] = useState<string | null>(null);
  const [activeCriticalIndex, setActiveCriticalIndex] = useState(0);
  const [streamGeneration, setStreamGeneration] = useState(0);

  const { showError } = useToast();

  const autoFollowLiveRef = useRef(autoFollowLive);
  const selectedTicketNumberRef = useRef<string | null>(selectedTicket?.ticketNumber ?? null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoFollowLiveRef.current = autoFollowLive;
  }, [autoFollowLive]);

  useEffect(() => {
    selectedTicketNumberRef.current = selectedTicket?.ticketNumber ?? null;
  }, [selectedTicket]);

  const fetchInitialReports = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY)) {
          setLoading(true);
        } else if (force) {
          setIsRefreshing(true);
        }

        const data = await fetchWithCache<LiveReportItem[]>(
          TICKETS_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<LiveReportItem[]>(TICKETS_CACHE_KEY);
            if (!json.success || !Array.isArray(json.data)) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: 'Data pantauan redaman belum dapat dimuat saat ini.',
              });
            }
            return json.data;
          },
          { force },
        );

        setLoadError(null);
        setReports(data);
        setLastHeartbeat(formatWibClock(new Date()));
        if (data.length > 0) {
          setSelectedTicket((prev) => prev ?? pickInitialReport(data));
        }
      } catch (err) {
        const normalized = normalizeAppError(err);
        setLoadError(normalized);
        showError(normalized, {
          onRetry:
            normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
              ? () => void fetchInitialReports(true)
              : undefined,
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchInitialReports();
  }, [fetchInitialReports]);

  useEffect(() => {
    let isDisposed = false;
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;

    const markConnected = () => {
      if (isDisposed) return;
      retryCount = 0;
      setReconnectCountdown(0);
      setSseState('LIVE_CONNECTED');
      setLastHeartbeat(formatWibClock(new Date()));
    };

    const connectSSE = () => {
      if (isDisposed) return;
      try {
        setSseState('CONNECTING');
        eventSource = new EventSource('/api/v1/admin/stream/reports');

        eventSource.onopen = markConnected;
        eventSource.addEventListener('connected', markConnected);
        eventSource.addEventListener('ping', markConnected);

        eventSource.addEventListener('report', (e) => {
          if (isDisposed) return;
          try {
            const item = JSON.parse(e.data) as IncomingSseReportPayload;
            if (!item.ticketNumber) return;

            const parsedDbm = Number(item.attenuationDbm);
            const attenuationValue = Number.isFinite(parsedDbm) ? parsedDbm : 0;
            const parsedDistance =
              item.distanceMeters !== undefined && item.distanceMeters !== null
                ? Number(item.distanceMeters)
                : undefined;
            const parsedPort =
              item.portNumber !== undefined && item.portNumber !== null
                ? Number(item.portNumber)
                : undefined;

            let mergedReport: LiveReportItem | null = null;

            setReports((prev) => {
              const existing = prev.find(
                (r) =>
                  r.ticketNumber === item.ticketNumber ||
                  (Boolean(item.id) && r.id === item.id),
              );

              const nextDistance =
                parsedDistance !== undefined && Number.isFinite(parsedDistance)
                  ? parsedDistance
                  : existing?.distanceToSplitterM;

              const nextStatus = inferSseStatus(item.title, existing?.status);

              const candidate: LiveReportItem = {
                ...(existing ?? {}),
                id: item.id || existing?.id || `live-${Date.now()}`,
                ticketNumber: item.ticketNumber!,
                customerName: item.customerName || existing?.customerName || 'Pelanggan',
                siaNumber: item.siaNumber || existing?.siaNumber || '',
                ticketType: inferTicketType(item.type, existing?.ticketType),
                cluster: item.clusterName || existing?.cluster || '',
                clusterCode: item.clusterCode || existing?.clusterCode,
                assignedTech: item.technicianName || existing?.assignedTech || 'Belum ditugaskan',
                techInitials: item.techInitials || existing?.techInitials || 'TK',
                status: nextStatus,
                currentAttenuation: attenuationValue,
                createdAt: existing?.createdAt || new Date().toISOString(),
                completedAt:
                  nextStatus === 'Selesai'
                    ? existing?.completedAt || new Date().toISOString()
                    : existing?.completedAt,
                splitterCode: item.splitterCode || existing?.splitterCode,
                portNumber:
                  parsedPort !== undefined && Number.isFinite(parsedPort) && parsedPort > 0
                    ? parsedPort
                    : existing?.portNumber,
                distanceToSplitterM: nextDistance,
                isLocationFlagged: item.isLocationFlagged ?? existing?.isLocationFlagged,
                isLiveIncoming: true,
              };

              mergedReport = candidate;
              return [
                candidate,
                ...prev.filter((r) => r.ticketNumber !== candidate.ticketNumber),
              ];
            });

            if (mergedReport) {
              const currentSelection = selectedTicketNumberRef.current;
              const isSameTicket = currentSelection === item.ticketNumber;
              if (autoFollowLiveRef.current || !currentSelection || isSameTicket) {
                setSelectedTicket(mergedReport);
              } else {
                setPendingLiveUpdates((count) => count + 1);
                setLatestLiveTicketNumber(item.ticketNumber);
              }
            }

            setLastHeartbeat(formatWibClock(new Date()));

            // Debounced server sync hydrates full metadata (GPS, ODP, pending OPM photo)
            if (syncTimerRef.current) {
              clearTimeout(syncTimerRef.current);
            }
            syncTimerRef.current = setTimeout(() => {
              if (!isDisposed) {
                void fetchInitialReports(true);
              }
            }, SSE_SYNC_DEBOUNCE_MS);
          } catch (err) {
            console.error('[Monitoring] Parse error pada SSE report event:', err);
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
          }
          if (isDisposed) return;
          retryCount += 1;
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), MAX_RECONNECT_DELAY_MS);
          const delaySec = Math.ceil(delayMs / 1000);
          setSseState('RECONNECTING');
          setReconnectCountdown(delaySec);

          if (countdownInterval) clearInterval(countdownInterval);
          countdownInterval = setInterval(() => {
            setReconnectCountdown((prev) => {
              if (prev <= 1) {
                if (countdownInterval) clearInterval(countdownInterval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          retryTimeout = setTimeout(() => {
            connectSSE();
          }, delayMs);
        };
      } catch (err) {
        if (!isDisposed) {
          setSseState('DISCONNECTED');
        }
        console.error('[Monitoring] Inisialisasi EventSource gagal:', err);
      }
    };

    connectSSE();

    return () => {
      isDisposed = true;
      if (eventSource) {
        eventSource.close();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [fetchInitialReports, streamGeneration]);

  const reconnectStream = useCallback(() => {
    setStreamGeneration((prev) => prev + 1);
    void fetchInitialReports(true);
  }, [fetchInitialReports]);

  const availableTechs = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.assignedTech && r.assignedTech !== 'Belum Ditugaskan' && r.assignedTech !== 'Belum ditugaskan') {
        set.add(r.assignedTech);
      }
    });
    return Array.from(set).sort();
  }, [reports]);

  const scopedReports = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    return reports.filter((r) => {
      const matchesCluster = matchesClusterSelection(r, cluster);
      const matchesType =
        typeFilter === 'Semua tipe' ||
        (typeFilter === 'Pasang baru' &&
          (r.ticketType === 'Pasang baru' || r.ticketType === 'Instalasi')) ||
        (typeFilter === 'Maintenance' &&
          (r.ticketType === 'Maintenance' || r.ticketType === 'Perbaikan'));
      const matchesTech = techFilter === 'Semua teknisi' || r.assignedTech === techFilter;
      const matchesSearch =
        trimmedSearch === '' ||
        r.customerName.toLowerCase().includes(trimmedSearch) ||
        r.ticketNumber.toLowerCase().includes(trimmedSearch) ||
        r.siaNumber.toLowerCase().includes(trimmedSearch) ||
        (Boolean(r.splitterCode) && r.splitterCode!.toLowerCase().includes(trimmedSearch)) ||
        r.assignedTech.toLowerCase().includes(trimmedSearch);

      return matchesCluster && matchesType && matchesTech && matchesSearch;
    });
  }, [reports, cluster, typeFilter, techFilter, search]);

  const severityCounts = useMemo(() => {
    let normal = 0;
    let warning = 0;
    let critical = 0;
    let unmeasured = 0;

    for (const report of scopedReports) {
      const severity = classifyMonitoringDbm(report.currentAttenuation);
      if (severity === 'Normal') normal += 1;
      else if (severity === 'Warning') warning += 1;
      else if (severity === 'Critical') critical += 1;
      else unmeasured += 1;
    }

    return {
      normal,
      warning,
      critical,
      unmeasured,
      measured: normal + warning + critical,
    };
  }, [scopedReports]);

  const filteredReports = useMemo(() => {
    if (tab === 'Semua') return scopedReports;
    return scopedReports.filter((r) => classifyMonitoringDbm(r.currentAttenuation) === tab);
  }, [scopedReports, tab]);

  const criticalReports = useMemo(() => {
    return scopedReports
      .filter((r) => classifyMonitoringDbm(r.currentAttenuation) === 'Critical')
      .sort((a, b) => {
        const aVal = isAttenuationMeasured(a.currentAttenuation) ? a.currentAttenuation : 0;
        const bVal = isAttenuationMeasured(b.currentAttenuation) ? b.currentAttenuation : 0;
        return aVal - bVal;
      });
  }, [scopedReports]);

  useEffect(() => {
    if (criticalReports.length === 0) {
      setActiveCriticalIndex(0);
    } else if (activeCriticalIndex >= criticalReports.length) {
      setActiveCriticalIndex(0);
    }
  }, [criticalReports.length, activeCriticalIndex]);

  const pinnedCriticalReport = criticalReports[activeCriticalIndex] ?? criticalReports[0] ?? null;

  const cycleCriticalReport = useCallback(
    (delta: -1 | 1) => {
      if (criticalReports.length <= 1) return;
      setActiveCriticalIndex(
        (prev) => (prev + delta + criticalReports.length) % criticalReports.length,
      );
    },
    [criticalReports.length],
  );

  const activeReport = useMemo(() => {
    if (selectedTicket) {
      const found = reports.find((r) => r.ticketNumber === selectedTicket.ticketNumber);
      if (found) return found;
    }
    return filteredReports[0] || reports[0] || null;
  }, [selectedTicket, filteredReports, reports]);

  const selectReport = useCallback((report: LiveReportItem) => {
    setSelectedTicket(report);
    if (latestLiveTicketNumber && report.ticketNumber === latestLiveTicketNumber) {
      setPendingLiveUpdates(0);
      setLatestLiveTicketNumber(null);
    }
  }, [latestLiveTicketNumber]);

  const jumpToLatestLiveReport = useCallback(() => {
    const target =
      (latestLiveTicketNumber
        ? reports.find((r) => r.ticketNumber === latestLiveTicketNumber)
        : null) ?? reports[0];
    setPendingLiveUpdates(0);
    setLatestLiveTicketNumber(null);
    if (target) {
      setSelectedTicket(target);
    }
    return target ?? null;
  }, [latestLiveTicketNumber, reports]);

  const toggleAutoFollowLive = useCallback((enabled: boolean) => {
    setAutoFollowLive(enabled);
    if (enabled) {
      setPendingLiveUpdates(0);
      setLatestLiveTicketNumber(null);
    }
  }, []);

  const formatTimestamp = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return 'Baru saja';
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    } catch {
      return 'Baru saja';
    }
  }, []);

  return {
    tab,
    setTab,
    search,
    setSearch,
    cluster,
    setCluster,
    typeFilter,
    setTypeFilter,
    techFilter,
    setTechFilter,
    reports,
    loading,
    isRefreshing,
    loadError,
    selectedTicket,
    setSelectedTicket: selectReport,
    modalTicket,
    setModalTicket,
    sseState,
    reconnectCountdown,
    lastHeartbeat,
    autoFollowLive,
    setAutoFollowLive: toggleAutoFollowLive,
    pendingLiveUpdates,
    jumpToLatestLiveReport,
    reconnectStream,
    availableTechs,
    scopedReports,
    filteredReports,
    normalCount: severityCounts.normal,
    warningCount: severityCounts.warning,
    criticalCount: severityCounts.critical,
    unmeasuredCount: severityCounts.unmeasured,
    measuredCount: severityCounts.measured,
    criticalReports,
    activeCriticalIndex,
    cycleCriticalReport,
    pinnedCriticalReport,
    activeReport,
    getMeterPercentage: getSpectrumMeterPercentage,
    formatTimestamp,
    fetchInitialReports,
  };
}
