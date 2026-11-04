'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const noticeWrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { hasPermission, user } = useAuth();

  useEffect(() => {
    if (!notice) return;
    function handleClickOutside(e: MouseEvent) {
      if (noticeWrapRef.current && !noticeWrapRef.current.contains(e.target as Node)) {
        setNotice(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNotice(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notice]);

  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:refresh-data'));
    }
    setTimeout(() => setIsRefreshing(false), 800);
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
        {_pageTitle && (
          <span className="header-page-title" title={_pageTitle}>
            {_pageTitle}
          </span>
        )}
      </div>

      <div className="header-right">
        {/* Management Quick Actions: Segarkan Data, Role & Akses, Pengaturan */}
        <nav className="header-nav-actions" aria-label="Menu Pengelolaan">
          <button
            type="button"
            className="icon-button header-action-btn"
            title="Segarkan Data Halaman"
            aria-label="Segarkan Data"
            onClick={handleRefresh}
          >
            <Icon name="refresh" size={17} className={isRefreshing ? 'icon-spin' : ''} />
          </button>

          {canEditRole ? (
            <Link
              href="/roles"
              className={`icon-button header-action-btn ${pathname.startsWith('/roles') ? 'active' : ''}`}
              title="Role & Akses (RBAC)"
              aria-label="Role & Akses"
            >
              <Icon name="user" size={19} />
            </Link>
          ) : (
            <div
              className="icon-button header-action-btn disabled"
              title="Izin role:edit diperlukan untuk membuka menu ini"
              aria-label="Role & Akses (Terkunci)"
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <Icon name="user" size={19} />
            </div>
          )}

          <Link
            href="/settings"
            className={`icon-button header-action-btn ${pathname.startsWith('/settings') ? 'active' : ''}`}
            title="Pengaturan Sistem"
            aria-label="Pengaturan"
          >
            <Icon name="settings" size={19} />
          </Link>
        </nav>

        <div className="header-divider" aria-hidden="true" />

        {/* Notifikasi Lonceng & Popover */}
        <div className="notification-wrap" ref={noticeWrapRef}>
          <button
            className={`icon-button notification ${notice ? 'active' : ''}`}
            onClick={() => setNotice((prev) => !prev)}
            aria-label="Notifikasi"
            aria-expanded={notice}
            type="button"
          >
            <Icon name="bell" size={19} />
            <i className="notification-dot" />
          </button>

          {notice && (
            <aside className="notification-pop" role="dialog" aria-label="Notifikasi terbaru">
              <b>Notifikasi terbaru</b>
              <p>Gangguan koneksi - Critical pada SIA 100245 (Cluster Bandung Utara: -26.4 dBm).</p>
              <small>Feed real-time · 2 menit lalu</small>
            </aside>
          )}
        </div>

        {/* Profil Akun Tunggal */}
        <div className="header-user-profile" title="Profil Akun Aktif">
          <div className="header-user-info">
            <span className="header-user-name">{user.fullName}</span>
            <span className="header-user-role">{user.roleName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
