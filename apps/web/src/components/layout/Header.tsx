'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/providers';
import { PERMISSIONS } from '@repo/shared';

interface HeaderProps {
  pageTitle?: string;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export function Header({
  pageTitle: _pageTitle,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
}: HeaderProps = {}) {
  const [notice, setNotice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission, user } = useAuth();

  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canUseAi = hasPermission(PERMISSIONS.AI_USE);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (q.toUpperCase().startsWith('SLA') || q.toUpperCase().startsWith('TKT')) {
      router.push(`/tickets?search=${encodeURIComponent(q)}`);
    } else if (q.toUpperCase().startsWith('ODP') || q.toUpperCase().startsWith('BDG')) {
      router.push(`/network?search=${encodeURIComponent(q)}`);
    } else {
      router.push(`/customers?search=${encodeURIComponent(q)}`);
    }
  };

  return (
    <header className="app-global-header">
      {/* Mobile Hamburger Menu Toggle */}
      <div className="header-left">
        <button
          type="button"
          className="header-hamburger-btn"
          onClick={onToggleMobileMenu}
          aria-label={isMobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          aria-expanded={isMobileMenuOpen}
        >
          <Icon name={isMobileMenuOpen ? 'x' : 'menu'} size={20} />
        </button>
      </div>

      {/* Search Bar - Active Global Search Form */}
      <search role="search" className="header-search-container">
        <form className="header-search-wrap" onSubmit={handleSearchSubmit}>
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
        </form>
      </search>

      <div className="header-right">
        {/* Management Quick Actions: AI Assistant, Role & Akses, Pengaturan */}
        <nav className="header-nav-actions" aria-label="Menu Pengelolaan">
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
        </nav>

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
          <div className="header-user-info">
            <span className="header-user-name">{user.fullName}</span>
            <span className="header-user-role">{user.roleName}</span>
          </div>
        </div>
      </div>

      {notice && (
        <aside className="notification-pop" aria-label="Notifikasi terbaru">
          <b>Notifikasi terbaru</b>
          <p>Gangguan koneksi - Critical pada SIA 100245 (Cluster Bandung Utara: -26.4 dBm).</p>
          <small>Feed real-time · 2 menit lalu</small>
        </aside>
      )}
    </header>
  );
}
