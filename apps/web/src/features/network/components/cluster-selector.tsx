'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/search-input';
import {
  ATTENUATION_THRESHOLDS,
  STANDARD_ACTION_LABELS,
  STANDARD_EMPTY_STATES,
  type ClusterListItem,
} from '@repo/shared';
import {
  getSplitterHealth,
  type ClusterGroup,
  type OdpQuickFilter,
} from '../hooks/use-network';

export interface ClusterSelectorProps {
  search: string;
  setSearch: (value: string) => void;
  odpQuickFilter: OdpQuickFilter;
  setOdpQuickFilter: (filter: OdpQuickFilter) => void;
  onResetFilters: () => void;
  clusterGroups: ClusterGroup[];
  totalFilteredOdps: number;
  abnormalOdpCount: number;
  expandedClusters: Record<string, boolean>;
  toggleClusterExpand: (clusterCode: string) => void;
  activeSplitter: ClusterListItem | null;
  onSelectSplitter: (splitterCode: string, clusterCode?: string) => void;
}

/**
 * Scalable Cluster & ODP Navigator for `/network`.
 * Uses a sticky scroll-bounded tree on desktop and a collapsible ODP picker drawer on mobile/tablet
 * so 90+ ODPs never overwhelm vertical scroll.
 *
 * @param props - Search/filter state, grouped clusters, active splitter, and selection handlers.
 * @returns Rendered cluster/ODP tree sidebar with responsive mobile toggle bar.
 * @example
 * <ClusterSelector search={search} setSearch={setSearch} ... />
 */
export function ClusterSelector({
  search,
  setSearch,
  odpQuickFilter,
  setOdpQuickFilter,
  onResetFilters,
  clusterGroups,
  totalFilteredOdps,
  abnormalOdpCount,
  expandedClusters,
  toggleClusterExpand,
  activeSplitter,
  onSelectSplitter,
}: ClusterSelectorProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isFilterActive = search.trim() !== '' || odpQuickFilter !== 'ALL';

  const quickFilters: Array<{ key: OdpQuickFilter; label: string; count?: number }> = [
    { key: 'ALL', label: 'Semua' },
    {
      key: 'ABNORMAL',
      label: `Anomali > ${ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB} dB`,
      count: abnormalOdpCount,
    },
    { key: 'AVAILABLE', label: 'Siap PSB' },
    { key: 'FULL', label: 'Penuh' },
  ];

  const handleSelectOdp = (splitterCode: string, clusterCode: string) => {
    onSelectSplitter(splitterCode, clusterCode);
    setMobileOpen(false);
  };

  return (
    <aside
      className={`tree-sidebar-card network-tree-sticky ${mobileOpen ? 'is-mobile-open' : ''}`}
      aria-label="Struktur Wilayah dan Daftar ODP"
    >
      {/* Mobile / Tablet Compact Active ODP Picker Toggle (< 1024px) */}
      <button
        type="button"
        className="mobile-odp-picker-trigger"
        aria-expanded={mobileOpen}
        aria-controls="network-odp-tree-body"
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        <div className="mobile-odp-picker-copy">
          <span className="mobile-odp-picker-eyebrow">ODP Terpilih</span>
          <strong className="mobile-odp-picker-code">
            {activeSplitter ? activeSplitter.splitterCode : 'Pilih Titik ODP'}
          </strong>
          {activeSplitter && (
            <span className="mobile-odp-picker-meta">
              {activeSplitter.name} · {activeSplitter.usedPorts}/{activeSplitter.maxPorts} port
            </span>
          )}
        </div>
        <span className="mobile-odp-picker-action">
          <span>{mobileOpen ? 'Tutup' : `Pilih ODP (${totalFilteredOdps})`}</span>
          <Icon
            name="chevron"
            size={14}
            className={`mobile-odp-picker-chevron ${mobileOpen ? 'is-open' : ''}`}
          />
        </span>
      </button>

      <div id="network-odp-tree-body" className="tree-collapsible-body">
        <header className="tree-sidebar-header">
          <h2 className="tree-sidebar-title">Struktur Wilayah</h2>
          <span className="tree-sidebar-counter">{totalFilteredOdps} ODP</span>
        </header>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari ODP, cluster, SIA, pelanggan..."
          ariaLabel="Cari ODP, cluster, SIA, atau pelanggan"
          className="tree-sidebar-search"
        />

        {/* Operational Quick Filter Chips */}
        <div className="tree-quick-filters" role="group" aria-label="Saring cepat status ODP">
          {quickFilters.map((qf) => {
            const active = odpQuickFilter === qf.key;
            return (
              <button
                key={qf.key}
                type="button"
                aria-pressed={active}
                className={`tree-quick-filter-chip ${active ? 'is-active' : ''} ${
                  qf.key === 'ABNORMAL' && abnormalOdpCount > 0 ? 'has-alert' : ''
                }`}
                onClick={() => setOdpQuickFilter(qf.key)}
              >
                <span>{qf.label}</span>
                {typeof qf.count === 'number' && qf.count > 0 && (
                  <span className="tree-quick-filter-badge">{qf.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scroll-bounded Tree List */}
        <div className="tree-scroll-viewport">
          {clusterGroups.length === 0 ? (
            <div className="tree-inline-empty">
              <EmptyState
                icon="search"
                title={STANDARD_EMPTY_STATES.NETWORK.FILTER_TITLE}
                description="Tidak ditemukan titik ODP untuk pencarian atau kategori filter saat ini."
                actionLabel={isFilterActive ? STANDARD_ACTION_LABELS.RESET_FILTER : undefined}
                actionIcon="refresh"
                onAction={isFilterActive ? onResetFilters : undefined}
                size="compact"
              />
            </div>
          ) : (
            <div className="tree-clusters-accordion">
              {clusterGroups.map((group) => {
                const hasActiveChild = group.splitters.some(
                  (s) => s.splitterCode === activeSplitter?.splitterCode,
                );
                const isExpanded = isFilterActive
                  ? true
                  : (expandedClusters[group.clusterCode] ?? hasActiveChild);

                return (
                  <div key={group.clusterCode} className="tree-cluster-node">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      className={`tree-cluster-head-btn ${hasActiveChild ? 'is-active-cluster' : ''}`}
                      onClick={() => toggleClusterExpand(group.clusterCode)}
                    >
                      <div className="tree-cluster-left-content">
                        <span
                          className={`tree-chevron-icon ${isExpanded ? 'expanded' : ''}`}
                          aria-hidden="true"
                        >
                          ▶
                        </span>
                        <span className="tree-cluster-title-text" title={group.name}>
                          {group.name}
                        </span>
                      </div>
                      <div className="tree-cluster-right-meta">
                        {group.abnormalCount > 0 && (
                          <span
                            className="tree-cluster-alert-pill"
                            title={`${group.abnormalCount} ODP dengan redaman > ${ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB} dB`}
                          >
                            {group.abnormalCount} anomali
                          </span>
                        )}
                        <span className="tree-cluster-port-count">
                          {group.splitters.length} ODP
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <nav className="tree-odp-branches-clean" aria-label={`ODP ${group.name}`}>
                        {group.splitters.map((s) => {
                          const isSelected = activeSplitter?.splitterCode === s.splitterCode;
                          const health = getSplitterHealth(s);
                          const isFull = s.maxPorts > 0 && s.usedPorts >= s.maxPorts;

                          return (
                            <button
                              key={s.splitterCode}
                              type="button"
                              aria-current={isSelected ? 'true' : undefined}
                              onClick={() => handleSelectOdp(s.splitterCode, s.clusterCode)}
                              className={`tree-odp-item-clean ${isSelected ? 'is-selected' : ''}`}
                              title={
                                s.locationName
                                  ? `${s.splitterCode} - ${s.locationName}`
                                  : s.splitterCode
                              }
                            >
                              <div className="tree-odp-leaf-left">
                                <span
                                  className={`tree-odp-health-dot is-${health.state}`}
                                  aria-hidden="true"
                                />
                                <div className="tree-odp-leaf-copy">
                                  <span className="tree-odp-leaf-code">{s.splitterCode}</span>
                                  {s.locationName && (
                                    <span className="tree-odp-leaf-loc">{s.locationName}</span>
                                  )}
                                </div>
                              </div>
                              <div className="tree-odp-leaf-right-group">
                                {health.badPortCount > 0 ? (
                                  <span className="tree-odp-mini-badge is-critical">
                                    &gt;{ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB}dB
                                  </span>
                                ) : isFull ? (
                                  <span className="tree-odp-mini-badge is-full">Penuh</span>
                                ) : null}
                                <span className="tree-odp-leaf-right">
                                  {s.usedPorts}/{s.maxPorts}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </nav>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
