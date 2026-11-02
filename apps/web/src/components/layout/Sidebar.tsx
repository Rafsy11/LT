'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface SidebarProps {
  ticketCount?: number;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  hasLiveDot?: boolean;
  count?: number;
  tag?: string;
}

export function Sidebar({ ticketCount = 3 }: SidebarProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { label: 'Overview', href: '/', icon: 'home' },
    { label: 'Live Monitoring', href: '/monitoring', icon: 'activity', hasLiveDot: true },
    { label: 'Tiket & Work Order', href: '/tickets', icon: 'ticket', count: ticketCount },
    { label: 'Cluster Jaringan', href: '/network', icon: 'network' },
    { label: 'Pelanggan (SIA)', href: '/customers', icon: 'users' },
    { label: 'Teknisi Lapangan', href: '/technicians', icon: 'wrench' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar" aria-label="Sidebar Navigasi">
      <Link href="/" className="brand lintasarta-brand-wrap" aria-label="Beranda Lintasarta">
        <img src="/assets/lintasarta-logo.png" alt="Lintasarta" className="brand-logo-img" />
      </Link>

      <section className="sidebar-workspace-section" aria-label="Workspace">
        <h2 className="nav-label">WORKSPACE</h2>
        <nav aria-label="Navigasi Utama">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {active && item.href === '/' && <span className="nav-active-dot" aria-hidden="true" />}
                {item.hasLiveDot && <i className="green-dot" aria-label="Status Live Aktif" />}
                {item.tag && <span className="ai-tag">{item.tag}</span>}
                {item.count !== undefined && <span className="nav-count" aria-label={`${item.count} tiket`}>{item.count}</span>}
              </Link>
            );
          })}
        </nav>
      </section>
    </aside>
  );
}
