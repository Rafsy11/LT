'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth-context';
import { PERMISSIONS } from '@repo/shared';

interface SidebarProps {
  ticketCount?: number;
}

export function Sidebar({ ticketCount = 3 }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();

  const navItems = [
    { label: 'Overview', href: '/', icon: 'home' },
    { label: 'Live Monitoring', href: '/monitoring', icon: 'activity', hasLiveDot: true },
    { label: 'Tiket & Work Order', href: '/tickets', icon: 'ticket', count: ticketCount },
    { label: 'Master Jaringan', href: '/network', icon: 'network' },
    { label: 'Pelanggan', href: '/customers', icon: 'users' },
    { label: 'Teknisi', href: '/technicians', icon: 'users' },
    { label: 'Field Simulator', href: '/field-simulator', icon: 'zap', tag: 'OUTDOOR UX' },
  ];

  // Conditional Rendering Berdasarkan Permission Matrix (Requirement 3)
  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canUseAi = hasPermission(PERMISSIONS.AI_USE);

  const mgmtItems = [
    ...(canUseAi
      ? [{ label: 'AI Assistant', href: '/ai', icon: 'spark', tag: 'LOCAL AI' }]
      : []),
    ...(canEditRole
      ? [{ label: 'Role & Akses', href: '/roles', icon: 'settings' }]
      : []),
    { label: 'Pengaturan', href: '/settings', icon: 'settings' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar">
      <Link href="/" className="brand lintasarta-brand-wrap">
        <img
          src="/assets/lintasarta-logo.png"
          alt="Lintasarta"
          className="brand-logo-img"
        />
      </Link>

      <div className="workspace">
        <span className="workspace-icon">N</span>
        <div>
          <b>Nusantara Network</b>
          <small>FTTH Single Source of Truth</small>
        </div>
        <span className="muted">⌄</span>
      </div>

      <p className="nav-label">WORKSPACE</p>
      <nav>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {active && item.href === '/' && <span className="nav-active-dot" />}
              {item.hasLiveDot && <i className="green-dot" />}
              {item.tag && <span className="ai-tag">{item.tag}</span>}
              {item.count !== undefined && (
                <span className="nav-count">{item.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <p className="nav-label management">MANAGEMENT</p>
      <nav>
        {mgmtItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.tag && <span className="ai-tag">{item.tag}</span>}
            </Link>
          );
        })}
        {!canEditRole && (
          <div className="nav-item-disabled" title="Izin role:edit diperlukan untuk membuka menu ini">
            <Icon name="settings" size={18} />
            <span style={{ color: '#94a3b8' }}>Role & Akses</span>
            <span className="badge-lock" style={{ marginLeft: 'auto', fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px' }}>Terkunci</span>
          </div>
        )}
      </nav>

      <div className="sidebar-bottom">
        <div className="server">
          <i className="green-dot" />
          <b>Sistem beroperasi normal</b>
          <small>On-premise · Server internal</small>
        </div>
        <div className="profile">
          <span className="avatar dark">N</span>
          <div>
            <b>Aditya Saputra</b>
            <small>Super Admin</small>
          </div>
          <span className="muted">⌄</span>
        </div>
      </div>
    </aside>
  );
}
