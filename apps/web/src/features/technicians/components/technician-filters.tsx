'use client';

import React, { useRef } from 'react';
import { SearchInput } from '@/components/ui/search-input';
import { useClusterOptions } from '@/hooks/use-cluster-options';

export type TechnicianFilterTab = 'all' | 'active_session' | 'busy' | 'revoked' | 'inactive';

export interface TechnicianFiltersProps {
  search: string;
  setSearch: (search: string) => void;
  cluster: string;
  setCluster: (cluster: string) => void;
  activeTab: TechnicianFilterTab;
  setActiveTab: (tab: TechnicianFilterTab) => void;
  clusterScopedLength: number;
  activeSessionsCount: number;
  busyCount: number;
  revokedCount: number;
  disabledCount: number;
}

interface TabOption {
  value: TechnicianFilterTab;
  label: string;
  count: number;
}

export function TechnicianFilters({
  search,
  setSearch,
  cluster,
  setCluster,
  activeTab,
  setActiveTab,
  clusterScopedLength,
  activeSessionsCount,
  busyCount,
  revokedCount,
  disabledCount,
}: TechnicianFiltersProps) {
  const { clusters } = useClusterOptions();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabOptions: TabOption[] = [
    { value: 'all', label: 'Semua', count: clusterScopedLength },
    { value: 'active_session', label: 'Sesi Aktif', count: activeSessionsCount },
    { value: 'busy', label: 'Bertugas', count: busyCount },
    { value: 'revoked', label: 'Sesi Dicabut', count: revokedCount },
    { value: 'inactive', label: 'Terkunci', count: disabledCount },
  ];

  const handleSelectTab = (nextTab: TechnicianFilterTab, index: number) => {
    setActiveTab(nextTab);
    tabRefs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null;
    if (e.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % tabOptions.length;
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + tabOptions.length) % tabOptions.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = tabOptions.length - 1;
    }

    if (targetIndex !== null) {
      e.preventDefault();
      const target = tabOptions[targetIndex];
      setActiveTab(target.value);
      const el = tabRefs.current[targetIndex];
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  };

  return (
    <div className="technician-sub-toolbar" aria-label="Filter dan pencarian teknisi">
      <div className="technician-toolbar-top">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari nama, username, NIK, vendor, atau ID perangkat..."
          ariaLabel="Cari teknisi lapangan"
          className="technician-search-box"
        />

        <select
          value={cluster}
          onChange={(e) => setCluster(e.target.value)}
          aria-label="Filter cluster penugasan"
          className="technician-cluster-select"
        >
          <option value="Semua cluster">Semua Cluster</option>
          {clusters.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name} ({item.clusterCode})
            </option>
          ))}
        </select>
      </div>

      <div
        role="tablist"
        aria-label="Filter status sesi teknisi"
        className="technician-status-tabs"
      >
        {tabOptions.map((option, idx) => {
          const isSelected = activeTab === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => handleSelectTab(option.value, idx)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className="technician-tab-btn"
            >
              <span>{option.label}</span>
              <span className="technician-tab-count">{option.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
