'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface SidebarProps {
  ticketCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  hasLiveDot?: boolean;
  count?: number;
  tag?: string;
}

export function Sidebar({ ticketCount = 3, isOpen = false, onClose }: SidebarProps) {
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
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Sidebar Navigasi">
      <div className="sidebar-header-row">
        <Link
          href="/"
          className="brand lintasarta-brand-wrap"
          aria-label="Beranda Lintasarta"
          onClick={onClose}
        >
          <div className="lintasarta-brand-inner">
            <Image
              src="/assets/Logo.png"
              alt="Lintasarta"
              width={38}
              height={48}
              priority
              className="lintasarta-emblem"
            />
            <div className="lintasarta-brand-text">
              <span className="brand-title">lintasarta</span>
              <span className="brand-tagline">Empowering Your Tomorrow</span>
            </div>
          </div>
        </Link>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Tutup menu navigasi"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

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
                onClick={onClose}
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
