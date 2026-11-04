import React from 'react';
import { Icon } from '@/components/ui/Icon';

interface CustomerStatsProps {
  totalCount: number;
  activeCount: number;
  pendingCount: number;
  criticalCount: number;
}

export function CustomerStats({
  totalCount,
  activeCount,
  pendingCount,
  criticalCount,
}: CustomerStatsProps) {
  return (
    <section
      className="customers-stats-grid"
      aria-label="Statistik Master Data Pelanggan"
    >
      <article className="stat-card">
        <span className="stat-card-ribbon blue">MASTER SIA</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round blue">
              <Icon name="users" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total Pelanggan</span>
              <div className="stat-card-value">{totalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">SIA terdaftar di wilayah terpilih</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon green">ONLINE</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round green">
              <Icon name="network" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Layanan Aktif</span>
              <div className="stat-card-value" style={{ color: '#166534' }}>{activeCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Port splitter terkunci aktif</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon amber">ANTREAN</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round amber">
              <Icon name="clock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Menunggu Instalasi</span>
              <div className="stat-card-value" style={{ color: '#b45309' }}>{pendingCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Tiket PSB dalam antrean teknisi</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon red">ATTENUATION</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round red">
              <Icon name="alert" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Redaman Kritis</span>
              <div className="stat-card-value" style={{ color: criticalCount > 0 ? '#be123c' : '#0f172a' }}>
                {criticalCount}
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Nilai redaman optik &lt; -25.0 dBm</span>
          </div>
        </div>
      </article>
    </section>
  );
}
