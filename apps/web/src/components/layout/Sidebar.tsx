'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface SidebarProps {
  ticketCount?: number;
}

export function Sidebar({ ticketCount = 24 }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Overview', href: '/', icon: 'grid' },
    { label: 'Live Monitoring', href: '/monitoring', icon: 'activity', hasLiveDot: true },
    { label: 'Tiket & Work Order', href: '/tickets', icon: 'ticket', count: ticketCount },
    { label: 'Master Jaringan', href: '/network', icon: 'network' },
    { label: 'Pelanggan', href: '/customers', icon: 'users' },
    { label: 'Teknisi', href: '/technicians', icon: 'users' },
  ];

  const mgmtItems = [
    { label: 'AI Assistant', href: '/ai', icon: 'spark', tag: 'AI' },
    { label: 'Role & Akses', href: '/roles', icon: 'settings' },
    { label: 'Pengaturan', href: '/settings', icon: 'settings' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-icon">
          <Icon name="network" size={24} />
        </span>
        fiber<span className="brand-light">ops</span>
        <span className="brand-dot">.</span>
      </Link>

      <div className="workspace">
        <span className="workspace-icon">N</span>
        <div>
          <b>Nusantara Network</b>
          <small>Workspace perusahaan</small>
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
              {item.hasLiveDot && <i className="green-dot" />}
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
      </nav>

      <div className="sidebar-bottom">
        <div className="server">
          <i className="green-dot" />
          <b>Sistem beroperasi normal</b>
          <small>On-premise · Server internal</small>
        </div>
        <div className="profile">
          <span className="avatar">AS</span>
          <div>
            <b>Aditya Saputra</b>
            <small>Super Admin</small>
          </div>
          <span>⋯</span>
        </div>
      </div>
    </aside>
  );
}
