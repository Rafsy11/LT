'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AiChatWidget } from '@/components/ai/AiChatWidget';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/ToastProvider';

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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = pageTitleMap[pathname] || 'Dashboard';
  const [ticketCount, setTicketCount] = useState(24);

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
    <AuthProvider>
      <ToastProvider>
        <div className="app">
          <Sidebar ticketCount={ticketCount} />
          <div className="main">
            <Header pageTitle={title} />
            {children}
            <footer>
              <span>© 2025 Fiberops. All rights reserved. Single Source of Truth FTTH.</span>
              <span>
                <i className="green-dot" />
                Seluruh layanan tersedia <span className="footer-divider">|</span> Versi 1.0.0 (On-Premise)
              </span>
            </footer>
          </div>
          <AiChatWidget />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}
