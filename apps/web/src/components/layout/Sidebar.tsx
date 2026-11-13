'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/providers';

interface SidebarProps {
  ticketCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  hasLiveDot?: boolean;
  count?: number;
  tag?: string;
}

export function Sidebar({
  ticketCount = 3,
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isVendorUser = user.userType === 'TECHNICIAN' || pathname.startsWith('/vendor');

  const navItems: NavItem[] = isVendorUser
    ? [
        {
          label: 'Portal Kerja Vendor',
          href: '/vendor',
          icon: 'wrench',
          count: ticketCount,
          tag: 'Lapangan',
        },
      ]
    : [
        { label: 'Overview', href: '/', icon: 'home' },
        { label: 'Live Monitoring', href: '/monitoring', icon: 'activity', hasLiveDot: true },
        { label: 'Tiket & Work Order', href: '/tickets', icon: 'ticket', count: ticketCount },
        { label: 'Cluster Jaringan', href: '/network', icon: 'network' },
        { label: 'Pelanggan (SIA)', href: '/customers', icon: 'users' },
        { label: 'Teknisi & Vendor', href: '/technicians', icon: 'wrench' },
        ...(user.userType === 'SUPER_ADMIN'
          ? [{ label: 'Portal Vendor', href: '/vendor', icon: 'send', tag: 'Simulasi' }]
          : []),
      ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  return (
    <>
      <aside
        className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
        aria-label="Sidebar Navigasi"
      >
        <div className="sidebar-header-row">
          <Link
            href={isVendorUser ? '/vendor' : '/'}
            className="brand lintasarta-brand-wrap"
            aria-label="Beranda Lintasarta"
            onClick={onClose}
          >
            <Image
              src="/assets/Lintasarta-Logo-Whitemode.svg"
              alt="Lintasarta"
              width={616}
              height={168}
              loading="eager"
              className="brand-logo-img brand-logo-full brand-logo-light"
            />
            <Image
              src="/assets/Lintasarta-Logo-Darkmode.svg"
              alt="Lintasarta"
              width={616}
              height={168}
              loading="eager"
              className="brand-logo-img brand-logo-full brand-logo-dark"
            />
            <Image
              src="/assets/Lintasarta-Icon.svg"
              alt="Lintasarta"
              width={112}
              height={112}
              loading="eager"
              className="brand-logo-img brand-logo-icon"
            />
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
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {active && item.href === '/' && (
                    <span className="nav-active-dot" aria-hidden="true" />
                  )}
                  {item.hasLiveDot && <i className="green-dot" aria-label="Status Live Aktif" />}
                  {item.tag && <span className="ai-tag">{item.tag}</span>}
                  {item.count !== undefined && (
                    <span className="nav-count" aria-label={`${item.count} tiket`}>
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </section>
      </aside>

      {/* Floating Toggle Button at Junction Corner (Sidebar + Header + Page) */}
      {onToggleCollapse && (
        <button
          type="button"
          className={`sidebar-toggle-btn ${isCollapsed ? 'collapsed' : ''}`}
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Perlebar sidebar navigasi' : 'Ciutkan sidebar navigasi'}
          title={isCollapsed ? 'Perlebar sidebar navigasi' : 'Ciutkan sidebar navigasi'}
        >
          <Icon name={isCollapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
        </button>
      )}
    </>
  );
}
