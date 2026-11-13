import React from 'react';
import { SearchInput } from '@/components/ui/search-input';

export interface TicketFiltersProps {
  search: string;
  setSearch: (value: string) => void;
  cluster: string;
  setCluster: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  totalCount: number;
  waitingCount: number;
  inProgressCount: number;
}

export function TicketFilters({
  search,
  setSearch,
  cluster,
  setCluster,
  typeFilter,
  setTypeFilter,
  tab,
  setTab,
  totalCount,
  waitingCount,
  inProgressCount,
}: TicketFiltersProps) {
  return (
    <>
      {/* Filter Toolbar without Clutter Pills */}
      <section className="tickets-toolbar">
        <div className="tickets-filter-group">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari nomor tiket, SIA, pelanggan, atau teknisi..."
            ariaLabel="Cari tiket"
            className="tickets-search"
          />

          <div className="select-wrapper">
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filter Wilayah Cluster"
              className="cluster-select"
            >
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
              <option>Bandung Selatan</option>
              <option>Cimahi</option>
              <option>Rancaekek</option>
            </select>
          </div>

          <div className="select-wrapper">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter Tipe Pekerjaan"
              className="cluster-select"
            >
              <option value="Semua tipe">Semua tipe pekerjaan</option>
              <option value="Pasang baru">Pasang baru (PSB)</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Perbaikan">Perbaikan redaman</option>
            </select>
          </div>
        </div>
      </section>

      {/* Segmented Status Tabs Bar (3 Clean Tabs: Semua, Menunggu, Dalam proses) */}
      <nav className="tickets-tabs-bar" role="tablist" aria-label="Filter Status Tiket">
        {[
          { label: 'Semua', count: totalCount },
          { label: 'Menunggu', count: waitingCount },
          { label: 'Dalam proses', count: inProgressCount },
        ].map((item) => (
          <button
            key={item.label}
            role="tab"
            aria-selected={tab === item.label}
            className={`ticket-tab-btn ${tab === item.label ? 'active' : ''}`}
            onClick={() => setTab(item.label)}
          >
            <span>{item.label}</span>
            <span className="ticket-tab-count">{item.count}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
