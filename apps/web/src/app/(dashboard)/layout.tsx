'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AiChatWidget } from '@/features/ai';
import {
  fetchWithCache,
  getCachedData,
  subscribeQueryCache,
} from '@/lib/query-cache';
import '@/styles/layout/shell.css';
import '@/styles/components/primitives.css';

const TICKETS_CACHE_KEY = '/api/v1/admin/tickets';

const pageTitleMap: Record<string, string> = {
  '/': 'Overview',
  '/monitoring': 'Live Monitoring',
  '/tickets': 'Tiket & Work Order',
  '/network': 'Master Jaringan',
  '/customers': 'Master Pelanggan (SIA)',
  '/technicians': 'Teknisi Lapangan',
  '/roles': 'Role-Based Access Control',
  '/settings': 'Pengaturan',
  '/ai': 'AI Assistant',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const title = pageTitleMap[pathname] || 'Dashboard';
  const [ticketCount, setTicketCount] = useState(24);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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
    const syncTicketCountFromCache = () => {
      const cached = getCachedData<unknown[]>(TICKETS_CACHE_KEY);
      if (Array.isArray(cached)) {
        setTicketCount(cached.length);
      }
    };

    const fetchTicketCount = (force = false) =>
      fetchWithCache<unknown[]>(
        TICKETS_CACHE_KEY,
        async () => {
          const res = await fetch(TICKETS_CACHE_KEY);
          const json = await res.json();
          if (!res.ok || !json.success || !Array.isArray(json.data)) {
            throw new Error(json.error?.message || 'Gagal memuat daftar tiket');
          }
          return json.data;
        },
        { force },
      )
        .then((list) => {
          setTicketCount(list.length);
        })
        .catch(() => {});

    syncTicketCountFromCache();
    const unsubscribe = subscribeQueryCache(TICKETS_CACHE_KEY, syncTicketCountFromCache);

    // Avoid firing duplicate /tickets call when landing directly on / which fetches /overview and seeds this cache
    if (pathnameRef.current !== '/' && !getCachedData<unknown[]>(TICKETS_CACHE_KEY)) {
      fetchTicketCount();
    }

    const handleGlobalRefresh = () => {
      const currentPath = pathnameRef.current;
      // Overview, Tickets, and Monitoring views already force-refresh or seed TICKETS_CACHE_KEY on global refresh
      if (currentPath !== '/' && currentPath !== '/tickets' && currentPath !== '/monitoring') {
        fetchTicketCount(true);
      }
    };

    window.addEventListener('app:refresh-data', handleGlobalRefresh);

    return () => {
      window.removeEventListener('app:refresh-data', handleGlobalRefresh);
      unsubscribe();
    };
  }, []);

  return (
    <div className="app">
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
        />
        {children}
        <footer>
          <span>&copy; 2025 Fiberops. All rights reserved. Single Source of Truth FTTH.</span>
          <span className="footer-version">Versi 1.0.0 (On-Premise)</span>
        </footer>
      </div>
      <AiChatWidget />
    </div>
  );
}
