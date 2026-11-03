'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SettingsTab } from '../hooks/use-settings';

export interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'infrastruktur', label: 'Infrastruktur & Komputasi AI', icon: 'activity' },
  { key: 'geofencing', label: 'Validasi Lapangan & Geofencing', icon: 'pin' },
  { key: 'backup', label: 'Disaster Recovery & Backup 3-2-1', icon: 'download' },
  { key: 'jaringan', label: 'Akses Jaringan & Distribusi APK', icon: 'network' },
];

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <nav
      role="tablist"
      aria-label="Tab Kategori Pengaturan"
      className="settings-tab-list"
    >
      {TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(t.key)}
            style={{
              padding: '10px 4px 12px',
              fontSize: '13px',
              fontWeight: active ? 600 : 500,
              color: active ? '#0e5b92' : '#64748b',
              background: 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid #0e5b92' : '2px solid transparent',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
