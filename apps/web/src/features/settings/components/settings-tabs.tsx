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
            className={`settings-tab-btn ${active ? 'active' : ''}`}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
