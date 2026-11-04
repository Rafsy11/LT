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
      <article className="stat-card">
        <span className="stat-card-ribbon blue">ODP SPLITTER</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round blue">
              <Icon name="network" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total ODP Splitter</span>
              <div className="stat-card-value">{networkStats.totalSplitters}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">terbagi dalam {networkStats.totalClusters} cluster wilayah</span>
          </div>
        </div>
      </article>

      {/* Card 2: Kapasitas Port Terpakai */}
      <article className="stat-card">
        <span className="stat-card-ribbon amber">UTILISASI</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round amber">
              <Icon name="activity" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Port terpakai</span>
              <div className="stat-card-value">{networkStats.usedCapacity}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="highlight-pill blue-pill">{networkStats.totalCapacity} total</span>
            <span className="caption">alokasi splitter</span>
          </div>
        </div>
      </article>

      {/* Card 3: Port Siap PSB */}
      <article className="stat-card">
        <span className="stat-card-ribbon green">SIAP PSB</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round green">
              <Icon name="check" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Port siap PSB</span>
              <div className="stat-card-value" style={{ color: '#166534' }}>{networkStats.availableCapacity}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">siap untuk instalasi baru</span>
          </div>
        </div>
      </article>

      {/* Card 4: Wilayah Cluster Aktif */}
      <article className="stat-card">
        <span className="stat-card-ribbon cyan">CAKUPAN</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round cyan">
              <Icon name="mapPin" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Cluster Wilayah</span>
              <div className="stat-card-value">{networkStats.totalClusters}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">cakupan operasional jaringan</span>
          </div>
        </div>
      </article>
    </section>
  );
}
