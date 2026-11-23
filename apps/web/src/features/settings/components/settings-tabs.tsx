'use client';

import React, { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SettingsTab } from '../hooks/use-settings';

export interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  dirtyTabs: ReadonlySet<SettingsTab>;
  errorTabs: ReadonlySet<SettingsTab>;
}

const TABS: { key: SettingsTab; label: string; shortLabel: string; icon: string }[] = [
  {
    key: 'infrastruktur',
    label: 'Infrastruktur & Komputasi AI',
    shortLabel: 'Infrastruktur & AI',
    icon: 'activity',
  },
  {
    key: 'geofencing',
    label: 'Validasi Lapangan & Geofencing',
    shortLabel: 'Geofencing & GPS',
    icon: 'pin',
  },
  {
    key: 'backup',
    label: 'Disaster Recovery & Backup 3-2-1',
    shortLabel: 'Backup 3-2-1',
    icon: 'download',
  },
  {
    key: 'jaringan',
    label: 'Profil, Jaringan & Distribusi APK',
    shortLabel: 'Jaringan & APK',
    icon: 'network',
  },
];

export function SettingsTabs({
  activeTab,
  onTabChange,
  dirtyTabs,
  errorTabs,
}: SettingsTabsProps) {
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});

  const selectAndFocus = (tab: SettingsTab) => {
    onTabChange(tab);
    const btn = tabRefs.current[tab];
    if (btn) {
      btn.focus();
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TABS.findIndex((t) => t.key === activeTab);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectAndFocus(TABS[(currentIndex + 1) % TABS.length].key);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectAndFocus(TABS[(currentIndex - 1 + TABS.length) % TABS.length].key);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectAndFocus(TABS[0].key);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectAndFocus(TABS[TABS.length - 1].key);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Tab Kategori Pengaturan"
      className="settings-tab-list"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((t) => {
        const active = activeTab === t.key;
        const hasError = errorTabs.has(t.key);
        const isDirty = dirtyTabs.has(t.key);
        return (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            id={`settings-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => selectAndFocus(t.key)}
            className={`settings-tab-btn ${active ? 'active' : ''}`}
          >
            <Icon name={t.icon} size={15} />
            <span className="settings-tab-label-full">{t.label}</span>
            <span className="settings-tab-label-short">{t.shortLabel}</span>
            {hasError ? (
              <span
                className="settings-tab-dot is-error"
                title="Terdapat input yang perlu diperbaiki pada kategori ini"
                aria-label="Perlu perbaikan"
              />
            ) : isDirty ? (
              <span
                className="settings-tab-dot is-dirty"
                title="Terdapat perubahan belum disimpan pada kategori ini"
                aria-label="Belum disimpan"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
