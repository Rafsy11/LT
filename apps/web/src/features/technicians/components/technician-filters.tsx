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
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '12px',
            color: '#334155',
            height: '31px',
            cursor: 'pointer',
            outline: 'none',
          }}
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
          style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '6px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: activeTab === 'all' ? 600 : 500,
              background: activeTab === 'all' ? '#ffffff' : 'transparent',
              color: activeTab === 'all' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Semua ({clusterScopedLength})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active_session'}
            onClick={() => setActiveTab('active_session')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: activeTab === 'active_session' ? 600 : 500,
              background: activeTab === 'active_session' ? '#ffffff' : 'transparent',
              color: activeTab === 'active_session' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'active_session' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sesi Aktif ({activeSessionsCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'busy'}
            onClick={() => setActiveTab('busy')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: activeTab === 'busy' ? 600 : 500,
              background: activeTab === 'busy' ? '#ffffff' : 'transparent',
              color: activeTab === 'busy' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'busy' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Bertugas ({busyCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'revoked'}
            onClick={() => setActiveTab('revoked')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: activeTab === 'revoked' ? 600 : 500,
              background: activeTab === 'revoked' ? '#ffffff' : 'transparent',
              color: activeTab === 'revoked' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'revoked' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sesi Dicabut ({revokedCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inactive'}
            onClick={() => setActiveTab('inactive')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: activeTab === 'inactive' ? 600 : 500,
              background: activeTab === 'inactive' ? '#ffffff' : 'transparent',
              color: activeTab === 'inactive' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'inactive' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Nonaktif ({disabledCount})
          </button>
        </div>
      </div>
    </nav>
  );
}
