import React from 'react';
import { Icon } from '@/components/ui/Icon';

export type TechnicianFilterTab = 'all' | 'active_session' | 'busy' | 'revoked' | 'inactive';

interface TechnicianFiltersProps {
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
  return (
    <nav
      className="technician-sub-toolbar"
      aria-label="Bilah Filter Teknisi"
    >
      {/* Left: Clean Inline Search Box */}
      <search
        role="search"
        aria-label="Cari teknisi"
        className="customer-search-box"
      >
        <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Icon name="search" size={14} />
        </span>
        <input
          aria-label="Cari teknisi"
          placeholder="Cari nama, username, ID perangkat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="customer-search-input"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Hapus pencarian"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </search>

      {/* Right: Cluster Dropdown beside Segmented Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <select
          value={cluster}
          onChange={(e) => setCluster(e.target.value)}
          aria-label="Filter Cluster"
          className="technician-cluster-select"
        >
          <option>Semua cluster</option>
          <option>Bandung Utara</option>
          <option>Bandung Timur</option>
          <option>Bandung Barat</option>
          <option>Bandung Selatan</option>
          <option>Cimahi</option>
          <option>Rancaekek</option>
        </select>

        {/* Segmented Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter status sesi teknisi"
          className="technician-status-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={`technician-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
          >
            Semua ({clusterScopedLength})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active_session'}
            onClick={() => setActiveTab('active_session')}
            className={`technician-tab-btn ${activeTab === 'active_session' ? 'is-active' : ''}`}
          >
            Sesi Aktif ({activeSessionsCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'busy'}
            onClick={() => setActiveTab('busy')}
            className={`technician-tab-btn ${activeTab === 'busy' ? 'is-active' : ''}`}
          >
            Bertugas ({busyCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'revoked'}
            onClick={() => setActiveTab('revoked')}
            className={`technician-tab-btn ${activeTab === 'revoked' ? 'is-active' : ''}`}
          >
            Sesi Dicabut ({revokedCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inactive'}
            onClick={() => setActiveTab('inactive')}
            className={`technician-tab-btn ${activeTab === 'inactive' ? 'is-active' : ''}`}
          >
            Nonaktif ({disabledCount})
          </button>
        </div>
      </div>
    </nav>
  );
}
