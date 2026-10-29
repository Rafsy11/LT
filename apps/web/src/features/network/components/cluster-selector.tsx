import React from 'react';
import { Icon } from '@/components/ui/Icon';
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
      <div className="tree-sidebar-header">
        <span className="tree-sidebar-title">Struktur Wilayah</span>
      </div>

      <div className="tree-sidebar-search">
        <span className="tree-sidebar-search-icon">
          <Icon name="search" size={13} />
        </span>
        <input
          type="text"
          className="tree-sidebar-search-input"
          placeholder="Cari cluster atau ODP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
                className={`tree-cluster-head-btn ${hasActiveChild ? 'is-active-cluster' : ''}`}
                onClick={() => toggleClusterExpand(group.clusterCode)}
              >
                <div className="tree-cluster-left-content">
                  <span className={`tree-chevron-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                  <span className="tree-cluster-title-text">{group.name}</span>
                </div>
                <span className="tree-cluster-port-count">
                  {group.totalUsed}/{group.totalPorts} port
                </span>
              </button>

              {isExpanded && (
                <div className="tree-odp-branches-clean">
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
                          <span className="tree-odp-leaf-chevron">›</span>
                          <span>{s.splitterCode}</span>
                        </div>
                        <span className="tree-odp-leaf-right">
                          {s.usedPorts}/{s.maxPorts} port
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
