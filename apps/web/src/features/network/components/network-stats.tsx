import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { ATTENUATION_THRESHOLDS, type NetworkStats as NetworkStatsType } from '@repo/shared';
import type { OdpQuickFilter } from '../hooks/use-network';

export interface NetworkStatsProps {
  networkStats: NetworkStatsType & {
    abnormalOdpCount: number;
    abnormalPortCount: number;
  };
  odpQuickFilter: OdpQuickFilter;
  onToggleAbnormalFilter: () => void;
}

/**
 * Operational KPI summary row for Master Jaringan (`/network`).
 * Replaces the redundant cluster card with an interactive `ODP Anomali (> 28 dB)` filter trigger.
 *
 * @param props - Aggregated splitter capacity metrics and abnormal filter toggle state.
 * @returns Rendered 4-card operational metrics grid.
 * @example
 * <NetworkStats networkStats={networkStats} odpQuickFilter={odpQuickFilter} onToggleAbnormalFilter={...} />
 */
export function NetworkStats({
  networkStats,
  odpQuickFilter,
  onToggleAbnormalFilter,
}: NetworkStatsProps) {
  const utilizationPct =
    networkStats.totalCapacity > 0
      ? Math.round((networkStats.usedCapacity / networkStats.totalCapacity) * 100)
      : 0;
  const isAbnormalActive = odpQuickFilter === 'ABNORMAL';
  const hasAnomalies = networkStats.abnormalOdpCount > 0;

  return (
    <section className="network-metrics-row-3" aria-label="Metrik Utama Jaringan">
      {/* Card 1: Total ODP & Cluster */}
      <article className="stat-card network-kpi-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="network" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total ODP Splitter</span>
              <div className="stat-card-value">{networkStats.totalSplitters}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              terbagi dalam {networkStats.totalClusters} cluster wilayah
            </span>
          </div>
        </div>
      </article>

      {/* Card 2: Kapasitas Port Terpakai */}
      <article className="stat-card network-kpi-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="activity" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Port Terpakai</span>
              <div className="stat-card-value">{networkStats.usedCapacity}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {utilizationPct}% dari total {networkStats.totalCapacity} port splitter
            </span>
          </div>
        </div>
      </article>

      {/* Card 3: Port Siap PSB */}
      <article className="stat-card network-kpi-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round is-ok">
              <Icon name="check" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Port Siap PSB</span>
              <div className="stat-card-value">{networkStats.availableCapacity}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">siap untuk instalasi pelanggan baru</span>
          </div>
        </div>
      </article>

      {/* Card 4: Interactive ODP Anomali (> 28 dB) Filter Card */}
      <button
        type="button"
        onClick={onToggleAbnormalFilter}
        aria-pressed={isAbnormalActive}
        className={`stat-card network-kpi-card network-kpi-interactive ${
          hasAnomalies ? 'is-alert' : 'is-healthy'
        } ${isAbnormalActive ? 'is-filter-selected' : ''}`}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className={`stat-card-icon-round ${hasAnomalies ? 'is-danger' : 'is-ok'}`}>
              <Icon name={hasAnomalies ? 'alert' : 'shield'} size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">
                ODP Anomali (&gt; {ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB} dB)
              </span>
              <div className="stat-card-value">{networkStats.abnormalOdpCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {hasAnomalies
                ? `${networkStats.abnormalPortCount} port buruk · ${isAbnormalActive ? 'Filter aktif' : 'Klik untuk saring'}`
                : 'Semua ODP terukur dalam batas normal'}
            </span>
          </div>
        </div>
      </button>
    </section>
  );
}
