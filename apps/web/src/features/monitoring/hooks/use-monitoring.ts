'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { classifyDbm } from '@repo/shared';
import { fetchWithCache, getCachedData } from '@/lib/query-cache';

const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';

export interface LiveReportItem {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: 'Pasang baru' | 'Perbaikan' | 'Maintenance' | 'Instalasi';
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Selesai' | 'Dibatalkan';
  priority?: 'Normal' | 'High' | 'Low';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  isLiveIncoming?: boolean;
}

export type SseState = 'CONNECTING' | 'LIVE_CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

function pickInitialReport(items: LiveReportItem[] | null): LiveReportItem | null {
  if (!items || items.length === 0) return null;
  const crit = items.find((r) => classifyDbm(r.currentAttenuation) === 'Critical');
  return crit || items[0];
}

export function useMonitoring() {
  const [tab, setTab] = useState<'Semua' | 'Normal' | 'Warning' | 'Critical'>('Semua');
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
  const [selectedTicket, setSelectedTicket] = useState<LiveReportItem | null>(() =>
    pickInitialReport(getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY)),
  );
  const [modalTicket, setModalTicket] = useState<LiveReportItem | null>(null);
  const [sseState, setSseState] = useState<SseState>('CONNECTING');
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('Memulai koneksi...');

  const fetchInitialReports = useCallback(async (force = false) => {
    try {
      if (!getCachedData<LiveReportItem[]>(TICKETS_CACHE_KEY)) {
        setLoading(true);
      }
      const data = await fetchWithCache<LiveReportItem[]>(
        TICKETS_CACHE_KEY,
        async () => {
          const res = await fetch(TICKETS_CACHE_KEY);
          const json = await res.json();
          if (!res.ok || !json.success || !Array.isArray(json.data)) {
            throw new Error(json.error?.message || 'Gagal mengambil data tiket awal');
          }
          return json.data as LiveReportItem[];
        },
        { force },
      );

      setReports(data);
      if (data.length > 0) {
        setSelectedTicket((prev) => prev ?? pickInitialReport(data));
      }
    } catch (err) {
      console.error('[Monitoring] Gagal mengambil data tiket awal:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;
    fetchInitialReports();

    let eventSource: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    let retryCount = 0;

    const connectSSE = () => {
      if (isDisposed) return;
      try {
        setSseState('CONNECTING');
        eventSource = new EventSource('/api/v1/admin/stream/reports');

        eventSource.onopen = () => {
          if (isDisposed) return;
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }) + ' WIB',
          );
        };

        eventSource.addEventListener('connected', () => {
          if (isDisposed) return;
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }) + ' WIB',
          );
        });

        eventSource.addEventListener('ping', () => {
          if (isDisposed) return;
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }) + ' WIB',
          );
        });

        eventSource.addEventListener('report', (e) => {
          if (isDisposed) return;
          try {
            const item = JSON.parse(e.data);
            const rawDbm = Number(item.attenuationDbm);
            const distance = item.distanceMeters !== undefined ? Number(item.distanceMeters) : 18;
            const isLocationFlagged = item.isLocationFlagged ?? distance > 100;

            const newReport: LiveReportItem = {
              id: item.id || `live-${Date.now()}`,
              ticketNumber: item.ticketNumber,
              customerName: item.customerName,
              siaNumber: item.siaNumber,
              ticketType: item.type === 'Pasang baru' ? 'Pasang baru' : 'Maintenance',
              cluster: item.clusterName,
              assignedTech: item.technicianName,
              techInitials: item.techInitials || 'TK',
              status: 'Selesai',
              currentAttenuation: rawDbm,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              splitterCode: item.splitterCode || 'ODP-LIVE',
              portNumber: item.portNumber || 1,
              distanceToSplitterM: distance,
              isLocationFlagged,
              isLiveIncoming: true,
            };

            setReports((prev) => [
              newReport,
              ...prev.filter((r) => r.ticketNumber !== newReport.ticketNumber),
            ]);
            setSelectedTicket(newReport);
            setLastHeartbeat(
              new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }) + ' WIB',
            );
          } catch (err) {
            console.error('[Monitoring] Parse error pada SSE report event:', err);
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
          }
          if (isDisposed) return;
          retryCount++;
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
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
    };
  }, [fetchInitialReports]);

  const availableTechs = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.assignedTech && r.assignedTech !== 'Belum Ditugaskan') set.add(r.assignedTech);
    });
    return Array.from(set).sort();
  }, [reports]);

  const scopedReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesCluster =
        cluster === 'Semua cluster' ||
        r.cluster.toLowerCase().includes(cluster.replace('Bandung ', '').toLowerCase());
      const matchesType =
        typeFilter === 'Semua tipe' ||
        (typeFilter === 'Pasang baru' &&
          (r.ticketType === 'Pasang baru' || r.ticketType === 'Instalasi')) ||
        (typeFilter === 'Maintenance' &&
          (r.ticketType === 'Maintenance' || r.ticketType === 'Perbaikan'));
      const matchesTech = techFilter === 'Semua teknisi' || r.assignedTech === techFilter;
      const matchesSearch =
        search.trim() === '' ||
        r.customerName.toLowerCase().includes(search.toLowerCase()) ||
        r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
        (r.splitterCode && r.splitterCode.toLowerCase().includes(search.toLowerCase())) ||
        r.assignedTech.toLowerCase().includes(search.toLowerCase());

      return matchesCluster && matchesType && matchesTech && matchesSearch;
    });
  }, [reports, cluster, typeFilter, techFilter, search]);

  const filteredReports = useMemo(() => {
    if (tab === 'Semua') return scopedReports;
    return scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === tab);
  }, [scopedReports, tab]);

  const normalCount = useMemo(
    () => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Normal').length,
    [scopedReports],
  );
  const warningCount = useMemo(
    () => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Warning').length,
    [scopedReports],
  );
  const criticalCount = useMemo(
    () => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Critical').length,
    [scopedReports],
  );

  const pinnedCriticalReport = useMemo(() => {
    return scopedReports.find((r) => classifyDbm(r.currentAttenuation) === 'Critical') || null;
  }, [scopedReports]);

  const activeReport = useMemo(() => {
    if (selectedTicket) {
      const found = reports.find((r) => r.ticketNumber === selectedTicket.ticketNumber);
      if (found) return found;
    }
    return filteredReports[0] || reports[0] || null;
  }, [selectedTicket, filteredReports, reports]);

  const getMeterPercentage = (dbm: number) => {
    const min = -30;
    const max = -10;
    const pct = ((dbm - min) / (max - min)) * 100;
    return Math.min(Math.max(pct, 4), 98);
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Baru saja';
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    } catch {
      return 'Baru saja';
    }
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
    techFilter,
    setTechFilter,
    reports,
    loading,
    selectedTicket,
    setSelectedTicket,
    modalTicket,
    setModalTicket,
    sseState,
    reconnectCountdown,
    lastHeartbeat,
    availableTechs,
    scopedReports,
    filteredReports,
    normalCount,
    warningCount,
    criticalCount,
    pinnedCriticalReport,
    activeReport,
    getMeterPercentage,
    formatTimestamp,
    fetchInitialReports,
  };
}
