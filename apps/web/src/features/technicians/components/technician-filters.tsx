import React from 'react';
import { SearchInput } from '@/components/ui/search-input';
import { useClusterOptions } from '@/hooks/use-cluster-options';

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
  const { clusters } = useClusterOptions();

  return (
    <nav
      className="technician-sub-toolbar"
      aria-label="Bilah Filter Teknisi"
    >
      {/* Left: Clean Inline Search Box */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Cari nama, username, ID perangkat..."
        ariaLabel="Cari teknisi"
        className="customer-search-box"
      />

      {/* Right: Cluster Dropdown beside Segmented Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <select
          value={cluster}
          onChange={(e) => setCluster(e.target.value)}
          aria-label="Filter Cluster"
          className="technician-cluster-select"
        >
          <option value="Semua cluster">Semua cluster</option>
          {clusters.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name} ({item.clusterCode})
            </option>
          ))}
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
