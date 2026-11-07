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
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
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
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="smartphone" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sesi Mobile Aktif</span>
              <div className="stat-card-value">{activeSessionsCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Token JWT sah tersinkron di Redis</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="clock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sedang Bertugas</span>
              <div className="stat-card-value">{busyCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Memegang tiket terbuka di lapangan</span>
          </div>
        </div>
      </article>

      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="lock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sesi Dicabut / Kunci</span>
              <div className="stat-card-value">
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
