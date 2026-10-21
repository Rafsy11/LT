'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth-context';
import { PERMISSIONS } from '@repo/shared';

interface HeaderProps {
  pageTitle: string;
}

export function Header({ pageTitle }: HeaderProps) {
  const [notice, setNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canUseAi = hasPermission(PERMISSIONS.AI_USE);

  return (
    <header className="app-global-header">
      {/* Search Bar - Shifted slightly towards the left */}
      <div className="header-search-wrap">
        <Icon name="search" size={16} className="header-search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari lokasi, pelanggan, tiket, atau ID cluster..."
          aria-label="Cari global"
          className="header-search-input"
        />
        <kbd className="header-search-kbd">/</kbd>
      </div>

      <div className="header-right">
        {/* Management Quick Actions: AI Assistant, Role & Akses, Pengaturan */}
        <div className="header-nav-actions" role="toolbar" aria-label="Menu Pengelolaan">
          {canUseAi && (
            <Link
              href="/ai"
              className={`icon-button header-action-btn ${pathname.startsWith('/ai') ? 'active' : ''}`}
              title="AI Assistant Operasional"
              aria-label="AI Assistant"
            >
              <Icon name="bot" size={19} />
            </Link>
          )}

          {canEditRole ? (
            <Link
              href="/roles"
              className={`icon-button header-action-btn ${pathname.startsWith('/roles') ? 'active' : ''}`}
              title="Role & Akses (RBAC)"
              aria-label="Role & Akses"
            >
              <Icon name="userCheck" size={19} />
            </Link>
          ) : (
            <div
              className="icon-button header-action-btn disabled"
              title="Izin role:edit diperlukan untuk membuka menu ini"
              aria-label="Role & Akses (Terkunci)"
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <Icon name="userCheck" size={19} />
            </div>
          )}

          <Link
            href="/settings"
            className={`icon-button header-action-btn ${pathname.startsWith('/settings') ? 'active' : ''}`}
            title="Pengaturan Sistem"
            aria-label="Pengaturan"
          >
            <Icon name="sliders" size={19} />
          </Link>
        </div>

        <div className="header-divider" aria-hidden="true" />

        {/* Notifikasi Lonceng */}
        <button
          className="icon-button notification"
          onClick={() => setNotice(!notice)}
          aria-label="Notifikasi"
          type="button"
        >
          <Icon name="bell" size={19} />
          <i className="notification-dot" />
        </button>

        {/* Profil Akun Tunggal */}
        <div className="header-user-profile" title="Profil Akun Aktif">
          <div className="header-avatar-circle" style={{ overflow: 'hidden', padding: 0 }}>
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18" cy="18" r="18" fill="#1e293b" />
              <circle cx="18" cy="13.5" r="5.5" fill="#fcd34d" />
              <path d="M13 13C13 9 15 7.5 18 7.5C21 7.5 23 9 23 13C23 11 21.5 9 18 9C14.5 9 13 11 13 13Z" fill="#18181b" />
              <path d="M7.5 32C8 25 12.5 21.5 18 21.5C23.5 21.5 28 25 28.5 32" fill="#0f172a" />
              <polygon points="18,21.5 15,26.5 21,26.5" fill="#ffffff" />
              <polygon points="18,23 17,29 19,29" fill="#1b5ca2" />
            </svg>
          </div>
          <div className="header-user-info">
            <span className="header-user-name">Budi Santoso</span>
            <span className="header-user-role">Super Admin</span>
          </div>
        </div>
      </div>

      {notice && (
        <div className="notification-pop">
          <b>Notifikasi terbaru</b>
          <p>Gangguan koneksi - Critical pada SIA 100245 (Cluster Bandung Utara: -26.4 dBm).</p>
          <small>Feed real-time · 2 menit lalu</small>
        </div>
      )}
    </header>
  );
}
