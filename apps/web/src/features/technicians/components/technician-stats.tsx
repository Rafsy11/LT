import React from 'react';
import { Icon } from '@/components/ui/Icon';

interface TechnicianStatsProps {
  totalCount: number;
  activeSessionsCount: number;
  busyCount: number;
  revokedCount: number;
  disabledCount: number;
}

export function TechnicianStats({
  totalCount,
  activeSessionsCount,
  busyCount,
  revokedCount,
  disabledCount,
}: TechnicianStatsProps) {
  return (
    <section
      className="technicians-stats-grid"
      aria-label="Statistik Teknisi & Sesi"
    >
      <article className="stat-card">
        <span className="stat-card-ribbon blue">ROSTER</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round blue">
              <Icon name="wrench" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Teknisi Terdaftar</span>
              <div className="stat-card-value">{totalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Pengguna aplikasi mobile terdaftar</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon green">ONLINE</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round green">
              <Icon name="smartphone" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sesi Mobile Aktif</span>
              <div className="stat-card-value" style={{ color: '#166534' }}>{activeSessionsCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Token JWT sah tersinkron di Redis</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon amber">DISPATCH</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round amber">
              <Icon name="clock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sedang Bertugas</span>
              <div className="stat-card-value" style={{ color: '#1b5ca2' }}>{busyCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Memegang tiket terbuka di lapangan</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <span className="stat-card-ribbon red">REVOKED</span>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round red">
              <Icon name="lock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sesi Dicabut / Kunci</span>
              <div className="stat-card-value" style={{ color: revokedCount > 0 || disabledCount > 0 ? '#be123c' : '#0f172a' }}>
                {revokedCount + disabledCount}
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">{revokedCount} sesi dicabut · {disabledCount} akun dikunci</span>
          </div>
        </div>
      </article>
    </section>
  );
}
