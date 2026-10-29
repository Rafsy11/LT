import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { NetworkStats as NetworkStatsType } from '@repo/shared';

export interface NetworkStatsProps {
  networkStats: NetworkStatsType;
}

export function NetworkStats({ networkStats }: NetworkStatsProps) {
  return (
    <section className="network-metrics-row-3" aria-label="Metrik Utama Jaringan">
      {/* Card 1: Total Cluster & ODP */}
      <article className="metric-card-clean">
        <div className="metric-card-header">
          <div className="metric-icon-box">
            <Icon name="network" size={20} />
          </div>
          <div className="metric-label-group">
            <span className="metric-label-text">Total ODP Splitter</span>
            <span className="metric-number-big">{networkStats.totalSplitters}</span>
          </div>
        </div>
        <div className="metric-footer-text">
          <span>terbagi dalam {networkStats.totalClusters} cluster wilayah</span>
        </div>
      </article>

      {/* Card 2: Kapasitas Port Terpakai */}
      <article className="metric-card-clean">
        <div className="metric-card-header">
          <div className="metric-icon-box">
            <Icon name="activity" size={20} />
          </div>
          <div className="metric-label-group">
            <span className="metric-label-text">Port terpakai</span>
            <span className="metric-number-big">{networkStats.usedCapacity}</span>
          </div>
        </div>
        <div className="metric-footer-text">
          <span className="metric-pill-chip">{networkStats.totalCapacity} kapasitas total</span>
          <span>alokasi splitter</span>
        </div>
      </article>

      {/* Card 3: Port Siap PSB */}
      <article className="metric-card-clean">
        <div className="metric-card-header">
          <div className="metric-icon-box">
            <Icon name="check" size={20} />
          </div>
          <div className="metric-label-group">
            <span className="metric-label-text">Port siap PSB</span>
            <span className="metric-number-big">{networkStats.availableCapacity}</span>
          </div>
        </div>
        <div className="metric-footer-text">
          <span>siap untuk instalasi baru</span>
        </div>
      </article>
    </section>
  );
}

