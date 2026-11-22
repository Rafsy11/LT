'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth, useTheme } from '@/providers';
import { PERMISSIONS } from '@repo/shared';

export interface HeaderNotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  href: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  isUnread?: boolean;
}

interface HeaderProps {
  pageTitle?: string;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  notifications?: HeaderNotificationItem[];
  onMarkAllRead?: () => void;
  onMarkNotificationRead?: (id: string) => void;
}

const THEME_OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: string }> = [
  { value: 'light', label: 'Terang (Light)', icon: 'sun' },
  { value: 'dark', label: 'Gelap (Dark)', icon: 'moon' },
  { value: 'system', label: 'Sistem (Otomatis)', icon: 'monitor' },
];

export function Header({
  pageTitle: _pageTitle,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
  notifications = [],
  onMarkAllRead,
  onMarkNotificationRead,
}: HeaderProps = {}) {
  const [notice, setNotice] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const noticeWrapRef = useRef<HTMLDivElement>(null);
  const themeWrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { hasPermission, user, logout, isLoggingOut } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();

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

  useEffect(() => {
    if (!isThemeOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (themeWrapRef.current && !themeWrapRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsThemeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isThemeOpen]);

  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const unreadCount = notifications.filter((item) => item.isUnread !== false).length;

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
          id="mobile-menu-toggle-btn"
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

          <Link
            href="/ai"
            className={`icon-button header-action-btn ${pathname.startsWith('/ai') ? 'active' : ''}`}
            title="Asisten AI (On-Premise)"
            aria-label="Asisten AI"
          >
            <Icon name="bot" size={18} />
          </Link>

          {canEditRole && (
            <Link
              href="/roles"
              className={`icon-button header-action-btn ${pathname.startsWith('/roles') ? 'active' : ''}`}
              title="Role & Akses (RBAC)"
              aria-label="Role & Akses"
            >
              <Icon name="user" size={19} />
            </Link>
          )}

          <Link
            href="/settings"
            className={`icon-button header-action-btn ${pathname.startsWith('/settings') ? 'active' : ''}`}
            title="Pengaturan Sistem"
            aria-label="Pengaturan"
          >
            <Icon name="settings" size={19} />
          </Link>

          <div className="theme-dropdown-wrap" ref={themeWrapRef}>
            <button
              type="button"
              className={`icon-button header-action-btn theme-switcher-btn ${resolvedTheme === 'dark' ? 'dark-active' : ''} ${isThemeOpen ? 'dropdown-open' : ''}`}
              onClick={() => setIsThemeOpen((prev) => !prev)}
              title={`Tema saat ini: ${theme === 'system' ? 'Sistem' : theme === 'dark' ? 'Gelap' : 'Terang'}. Klik untuk memilih tema.`}
              aria-label={`Pilih Tema Antarmuka (Aktif: ${theme === 'system' ? 'Sistem' : theme === 'dark' ? 'Gelap' : 'Terang'})`}
              aria-expanded={isThemeOpen}
              aria-haspopup="listbox"
            >
              <Icon
                name={theme === 'system' ? 'monitor' : theme === 'dark' ? 'moon' : 'sun'}
                size={18}
              />
            </button>

            {isThemeOpen && (
              <div
                className="theme-dropdown-menu"
                role="listbox"
                aria-label="Pilihan Tema Antarmuka"
                onKeyDown={(e) => {
                  const items = Array.from(
                    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
                  );
                  if (items.length === 0) return;
                  const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    items[(currentIdx + 1) % items.length]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    items[(currentIdx - 1 + items.length) % items.length]?.focus();
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    items[0]?.focus();
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    items[items.length - 1]?.focus();
                  }
                }}
              >
                {THEME_OPTIONS.map((opt) => {
                  const isSelected = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`theme-dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setTheme(opt.value);
                        setIsThemeOpen(false);
                      }}
                    >
                      <span className="theme-item-left">
                        <Icon name={opt.icon} size={15} />
                        <span>{opt.label}</span>
                      </span>
                      {isSelected && (
                        <span className="theme-item-check" aria-hidden="true">
                          <Icon name="check" size={13} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="header-divider" aria-hidden="true" />

        {/* Notifikasi Lonceng & Popover */}
        <div className="notification-wrap" ref={noticeWrapRef}>
          <button
            className={`icon-button notification ${notice ? 'active' : ''}`}
            onClick={() => setNotice((prev) => !prev)}
            aria-label={unreadCount > 0 ? `Notifikasi (${unreadCount} belum dibaca)` : 'Notifikasi'}
            aria-expanded={notice}
            type="button"
          >
            <Icon name="bell" size={19} />
            {unreadCount > 0 && <i className="notification-dot" aria-hidden="true" />}
          </button>

          {notice && (
            <aside className="notification-pop" aria-label="Notifikasi terbaru">
              <div className="notification-pop-header">
                <b>Notifikasi {unreadCount > 0 ? `(${unreadCount})` : ''}</b>
                {unreadCount > 0 && onMarkAllRead && (
                  <button
                    type="button"
                    className="notification-mark-read"
                    onClick={onMarkAllRead}
                  >
                    Tandai semua dibaca
                  </button>
                )}
              </div>
              {notifications.length > 0 ? (
                <div className="notification-list">
                  {notifications.map((item) => {
                    const dotClass =
                      item.severity === 'critical'
                        ? 'red'
                        : item.severity === 'warning'
                          ? 'amber'
                          : item.severity === 'success'
                            ? 'green'
                            : '';
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`notification-item ${item.isUnread !== false ? 'unread' : ''}`}
                        onClick={() => {
                          onMarkNotificationRead?.(item.id);
                          setNotice(false);
                        }}
                      >
                        <div className="notification-item-top">
                          <span className="notification-item-title">
                            <span className={`status-dot ${dotClass}`} aria-hidden="true" />
                            <strong>{item.title}</strong>
                          </span>
                          <time>{item.timestamp}</time>
                        </div>
                        <p>{item.message}</p>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  <EmptyState
                    icon="bell"
                    title="Belum ada notifikasi insiden baru"
                    description="Peringatan eskalasi telemetri dan tiket aktif akan tampil di sini."
                    size="compact"
                  />
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Profil Akun Aktif & Logout */}
        <div className="header-user-profile" title="Profil Akun Aktif">
          <div className="header-user-info">
            <span className="header-user-name">{user.fullName}</span>
            <span className="header-user-role">{user.roleName}</span>
          </div>
          <button
            type="button"
            className="icon-button header-action-btn header-logout-btn"
            onClick={logout}
            disabled={isLoggingOut}
            title="Keluar Sesi (Logout)"
            aria-label="Keluar Sesi"
          >
            <Icon name="logOut" size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
