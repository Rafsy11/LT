'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const { hasPermission, user } = useAuth();

  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canUseAi = hasPermission(PERMISSIONS.AI_USE);

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
        {_pageTitle && (
          <span className="header-page-title" title={_pageTitle}>
            {_pageTitle}
          </span>
        )}
      </div>

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
