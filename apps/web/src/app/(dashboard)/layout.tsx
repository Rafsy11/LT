'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AiChatWidget } from '@/features/ai';

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
  const title = pageTitleMap[pathname] || 'Dashboard';
  const [ticketCount, setTicketCount] = useState(24);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    fetch('/api/v1/admin/tickets')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.meta?.count !== undefined) {
          setTicketCount(json.meta.count);
        }
      })
      .catch(() => {});
  }, [pathname]);

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
      />
      <div className="main">
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
