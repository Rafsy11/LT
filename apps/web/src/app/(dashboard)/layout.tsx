'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import type { DbTicket } from '@repo/shared';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header, type HeaderNotificationItem } from '@/components/layout/Header';
import { ConnectionBanner } from '@/components/ui/connection-banner';
import { AiChatWidget } from '@/features/ai';
import { notifyApiResponseError } from '@/lib/api-error';
import {
  fetchWithCache,
  getCachedData,
  subscribeQueryCache,
} from '@/lib/query-cache';
import { useAuth } from '@/providers';
import '@/styles/layout/shell.css';
import '@/styles/components/primitives.css';

const ADMIN_TICKETS_CACHE_KEY = '/api/v1/admin/tickets';
const TECH_TICKETS_CACHE_KEY = '/api/v1/tech/tickets';
const READ_NOTIFICATIONS_STORAGE_KEY = 'fiberops_read_notifications';
const MAX_STORED_READ_IDS = 100;
const MAX_STREAM_ALERTS = 6;
const MAX_VISIBLE_NOTIFICATIONS = 8;

const pageTitleMap: Record<string, string> = {
  '/': 'Ringkasan',
  '/monitoring': 'Pantauan Langsung',
  '/tickets': 'Tiket & Tugas',
  '/network': 'Master Jaringan',
  '/customers': 'Master Pelanggan (SIA)',
  '/technicians': 'Teknisi & Vendor',
  '/vendor': 'Portal Kerja Vendor',
  '/roles': 'Role & Akses (RBAC)',
  '/settings': 'Pengaturan',
  '/ai': 'Asisten AI',
};

function formatNotificationTime(iso?: string): string {
  if (!iso) return 'Baru saja';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Baru saja';
  return parsed.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isVendorScope = pathname.startsWith('/vendor') || user.userType === 'TECHNICIAN';
  const activeCacheKey = isVendorScope ? TECH_TICKETS_CACHE_KEY : ADMIN_TICKETS_CACHE_KEY;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const title = pageTitleMap[pathname] || 'Dasbor';
  const [ticketCount, setTicketCount] = useState(0);
  const [cachedTickets, setCachedTickets] = useState<DbTicket[]>([]);
  const [streamAlerts, setStreamAlerts] = useState<HeaderNotificationItem[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        document.getElementById('mobile-menu-toggle-btn')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Restore persisted collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fiberops_sidebar_collapsed');
      if (saved !== null) {
        setIsSidebarCollapsed(saved === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fiberops_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(READ_NOTIFICATIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setReadNotificationIds(new Set(parsed.filter((v): v is string => typeof v === 'string')));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const syncTicketCountFromCache = () => {
      const cached = getCachedData<DbTicket[]>(activeCacheKey);
      if (Array.isArray(cached)) {
        setTicketCount(cached.length);
        setCachedTickets(cached);
      }
    };

    const fetchTicketCount = (force = false) =>
      fetchWithCache<DbTicket[]>(
        activeCacheKey,
        async () => {
          const res = await fetch(activeCacheKey);
          const json = await res.json().catch(() => null);
          if (isVendorScope) {
            if (!res.ok || !json?.success) {
              const parsed = notifyApiResponseError(
                res.status,
                json,
                'Gagal memuat daftar tiket vendor dari PostgreSQL.',
                { category: 'database', source: activeCacheKey },
              );
              throw new Error(parsed.message);
            }
            const list = Array.isArray(json?.data?.tickets) ? (json.data.tickets as DbTicket[]) : [];
            return list;
          }
          if (!res.ok || !json?.success || !Array.isArray(json.data)) {
            const parsed = notifyApiResponseError(
              res.status,
              json,
              'Gagal memuat daftar tiket dari PostgreSQL.',
              { category: 'database', source: activeCacheKey },
            );
            throw new Error(parsed.message);
          }
          return json.data as DbTicket[];
        },
        { force },
      )
        .then((list) => {
          setTicketCount(list.length);
          setCachedTickets(list);
        })
        .catch(() => {});

    syncTicketCountFromCache();
    const unsubscribe = subscribeQueryCache(activeCacheKey, syncTicketCountFromCache);

    if (
      pathnameRef.current !== '/' &&
      !pathnameRef.current.startsWith('/vendor') &&
      !getCachedData<DbTicket[]>(activeCacheKey)
    ) {
      fetchTicketCount();
    } else if (isVendorScope && !getCachedData<DbTicket[]>(activeCacheKey)) {
      fetchTicketCount();
    }

    const handleGlobalRefresh = () => {
      const currentPath = pathnameRef.current;
      if (
        currentPath !== '/' &&
        currentPath !== '/tickets' &&
        currentPath !== '/monitoring' &&
        currentPath !== '/vendor'
      ) {
        fetchTicketCount(true);
      }
    };

    window.addEventListener('app:refresh-data', handleGlobalRefresh);

    return () => {
      window.removeEventListener('app:refresh-data', handleGlobalRefresh);
      unsubscribe();
    };
  }, [activeCacheKey, isVendorScope]);

  useEffect(() => {
    if (
      isVendorScope ||
      user.userType === 'TECHNICIAN' ||
      !user.id ||
      typeof EventSource === 'undefined'
    ) {
      return;
    }

    const eventSource = new EventSource('/api/v1/admin/stream/reports');
    const handleReport = (e: MessageEvent) => {
      try {
        const item = JSON.parse(e.data) as {
          id?: string;
          ticketNumber?: string;
          customerName?: string;
          clusterName?: string;
          technicianName?: string;
          attenuationDbm?: number | string;
          distanceMeters?: number | string;
          isLocationFlagged?: boolean;
        };
        const rawDbm = Number(item.attenuationDbm);
        const distance = item.distanceMeters !== undefined ? Number(item.distanceMeters) : 0;
        const isFlagged = Boolean(item.isLocationFlagged || distance > 100);
        const isCriticalDbm = !Number.isNaN(rawDbm) && rawDbm !== 0 && rawDbm < -24;
        const severity: HeaderNotificationItem['severity'] =
          isFlagged || isCriticalDbm ? 'critical' : 'warning';
        const ticketNo = item.ticketNumber || 'Tiket Baru';
        const title = isFlagged
          ? `Anomali GPS · ${ticketNo}`
          : isCriticalDbm
            ? `Redaman Kritis (${rawDbm} dBm) · ${ticketNo}`
            : `Laporan Masuk · ${ticketNo}`;
        const message = [item.customerName, item.clusterName, item.technicianName]
          .filter(Boolean)
          .join(' · ');
        const alertId = `sse-${item.id || ticketNo}-${Date.now()}`;

        setStreamAlerts((prev) =>
          [
            {
              id: alertId,
              title,
              message: message || 'Laporan lapangan baru diterima.',
              timestamp: new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              href: '/monitoring',
              severity,
            },
            ...prev,
          ].slice(0, MAX_STREAM_ALERTS),
        );
      } catch {
        // Ignore malformed SSE event payload
      }
    };

    eventSource.addEventListener('report', handleReport);
    return () => {
      eventSource.removeEventListener('report', handleReport);
      eventSource.close();
    };
  }, [isVendorScope, user.id, user.userType]);

  const notifications = useMemo<HeaderNotificationItem[]>(() => {
    const ticketItems: HeaderNotificationItem[] = [];

    if (isVendorScope) {
      const vendorActive = cachedTickets.filter(
        (t) =>
          t.status === 'Menunggu' ||
          t.status === 'Dalam proses' ||
          t.status === 'Menunggu verifikasi',
      );
      for (const t of vendorActive.slice(0, 6)) {
        const title =
          t.status === 'Menunggu'
            ? `Tugas Baru · ${t.ticketNumber}`
            : t.status === 'Dalam proses'
              ? `Sedang Dikerjakan · ${t.ticketNumber}`
              : `Menunggu Verifikasi · ${t.ticketNumber}`;
        const severity: HeaderNotificationItem['severity'] =
          t.status === 'Menunggu'
            ? 'warning'
            : t.status === 'Dalam proses'
              ? 'info'
              : 'success';
        ticketItems.push({
          id: `ticket-${t.id}-${t.status}`,
          title,
          message: [t.customerName, t.cluster].filter(Boolean).join(' · '),
          timestamp: formatNotificationTime(t.dispatchedAt || t.createdAt),
          href: '/vendor',
          severity,
        });
      }
    } else {
      const relevant = cachedTickets.filter((t) => {
        const isCriticalDbm =
          typeof t.currentAttenuation === 'number' &&
          t.currentAttenuation !== 0 &&
          t.currentAttenuation < -24;
        return (
          Boolean(t.isLocationFlagged) ||
          isCriticalDbm ||
          t.status === 'Menunggu verifikasi' ||
          t.status === 'Menunggu'
        );
      });

      const score = (t: DbTicket): number => {
        const isCriticalDbm =
          typeof t.currentAttenuation === 'number' &&
          t.currentAttenuation !== 0 &&
          t.currentAttenuation < -24;
        if (t.isLocationFlagged || isCriticalDbm) return 0;
        if (t.status === 'Menunggu verifikasi') return 1;
        return 2;
      };

      const ordered = [...relevant].sort((a, b) => score(a) - score(b));
      for (const t of ordered.slice(0, 6)) {
        const isCriticalDbm =
          typeof t.currentAttenuation === 'number' &&
          t.currentAttenuation !== 0 &&
          t.currentAttenuation < -24;
        let title = `Menunggu Penugasan · ${t.ticketNumber}`;
        let severity: HeaderNotificationItem['severity'] = 'info';

        if (t.isLocationFlagged) {
          title = `Anomali Lokasi GPS · ${t.ticketNumber}`;
          severity = 'critical';
        } else if (isCriticalDbm) {
          title = `Redaman Kritis (${t.currentAttenuation} dBm) · ${t.ticketNumber}`;
          severity = 'critical';
        } else if (t.status === 'Menunggu verifikasi') {
          title = `Perlu Verifikasi QA · ${t.ticketNumber}`;
          severity = 'warning';
        }

        ticketItems.push({
          id: `ticket-${t.id}-${t.status}-${t.isLocationFlagged ? 'flag' : 'ok'}`,
          title,
          message: [t.customerName, t.cluster, t.assignedTech].filter(Boolean).join(' · '),
          timestamp: formatNotificationTime(
            t.pendingSubmission?.submittedAt || t.dispatchedAt || t.createdAt,
          ),
          href: '/tickets',
          severity,
        });
      }
    }

    const merged = [...streamAlerts, ...ticketItems].slice(0, MAX_VISIBLE_NOTIFICATIONS);
    return merged.map((item) => ({
      ...item,
      isUnread: !readNotificationIds.has(item.id),
    }));
  }, [cachedTickets, isVendorScope, readNotificationIds, streamAlerts]);

  const persistReadIds = useCallback((next: Set<string>) => {
    try {
      const compact = Array.from(next).slice(-MAX_STORED_READ_IDS);
      sessionStorage.setItem(READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore
    }
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      persistReadIds(next);
      return next;
    });
  }, [notifications, persistReadIds]);

  const handleMarkNotificationRead = useCallback(
    (id: string) => {
      setReadNotificationIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        persistReadIds(next);
        return next;
      });
    },
    [persistReadIds],
  );

  return (
    <div className="app">
      <a href="#main-content" className="skip-to-content">
        Lewati ke konten utama
      </a>
      {/* Mobile Off-Canvas Backdrop */}
      <div
        className={`sidebar-backdrop ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        ticketCount={ticketCount}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />
      <div className={`main ${isSidebarCollapsed ? 'sidebar-collapsed collapsed' : ''}`}>
        <Header
          pageTitle={title}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onMarkNotificationRead={handleMarkNotificationRead}
        />
        <ConnectionBanner />
        {children}
        <footer>
          <span>
            &copy; 2026 FiberOps Lintasarta. Hak cipta dilindungi. Single Source of Truth FTTH.
          </span>
          <span className="footer-version">Versi 1.0.0 (On-Premise)</span>
        </footer>
      </div>
      {!isVendorScope && <AiChatWidget />}
    </div>
  );
}
