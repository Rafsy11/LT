import React from 'react';
import { SearchInput } from '@/components/ui/search-input';
import type { ClusterListItem } from '@repo/shared';
import type { ClusterGroup } from '../hooks/use-network';

export interface ClusterSelectorProps {
  search: string;
  setSearch: (value: string) => void;
  clusterGroups: ClusterGroup[];
  expandedClusters: Record<string, boolean>;
  toggleClusterExpand: (clusterCode: string) => void;
  activeSplitter: ClusterListItem | null;
  setActiveSplitterCode: (code: string) => void;
  setExpandedPortNum: (num: number | null) => void;
}

export function ClusterSelector({
  search,
  setSearch,
  clusterGroups,
  expandedClusters,
  toggleClusterExpand,
  activeSplitter,
  setActiveSplitterCode,
  setExpandedPortNum,
}: ClusterSelectorProps) {
  return (
    <aside className="tree-sidebar-card" aria-label="Struktur Wilayah">
      <header className="tree-sidebar-header">
        <h2 className="tree-sidebar-title" style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}>
          Struktur Wilayah
        </h2>
      </header>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Cari cluster atau ODP..."
        ariaLabel="Cari cluster atau ODP"
        className="tree-sidebar-search"
      />

      <div className="tree-clusters-accordion">
        {clusterGroups.map((group) => {
          const isExpanded = expandedClusters[group.clusterCode] ?? true;
          const hasActiveChild = group.splitters.some(
            (s) => s.splitterCode === activeSplitter?.splitterCode,
          );

          return (
            <div key={group.clusterCode} className="tree-cluster-node">
              <button
                type="button"
                aria-expanded={isExpanded}
                className={`tree-cluster-head-btn ${hasActiveChild ? 'is-active-cluster' : ''}`}
                onClick={() => toggleClusterExpand(group.clusterCode)}
              >
                <div className="tree-cluster-left-content">
                  <span className={`tree-chevron-icon ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">▶</span>
                  <span className="tree-cluster-title-text">{group.name}</span>
                </div>
                <span className="tree-cluster-port-count">
                  {group.totalUsed}/{group.totalPorts} port
                </span>
              </button>

              {isExpanded && (
                <nav className="tree-odp-branches-clean" aria-label={`ODP ${group.name}`}>
                  {group.splitters.map((s) => {
                    const isSelected = activeSplitter?.splitterCode === s.splitterCode;
                    return (
                      <button
                        key={s.splitterCode}
                        type="button"
                        onClick={() => {
                          setActiveSplitterCode(s.splitterCode);
                          setExpandedPortNum(1);
                        }}
                        className={`tree-odp-item-clean ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="tree-odp-leaf-left">
                          <span className="tree-odp-leaf-chevron" aria-hidden="true">›</span>
                          <span>{s.splitterCode}</span>
                        </div>
                        <span className="tree-odp-leaf-right">
                          {s.usedPorts}/{s.maxPorts} port
                        </span>
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
