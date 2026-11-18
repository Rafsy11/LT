'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Beranda',
    href: '/',
    icon: 'home',
    exact: true,
  },
  {
    label: 'AI Assistant',
    href: '/ai',
    icon: 'bot',
  },
  {
    label: 'Pengaturan',
    href: '/settings',
    icon: 'settings',
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" aria-label="Navigasi Bawah Seluler">
      <div className="mobile-bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden="true">
                <Icon name={item.icon} size={20} />
              </span>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
