import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface OverviewStatsProps {
  customerCount: number | null;
  activeTicketsCount: number;
  waitingTicketsCount: number;
  techStats: { total: number; active: number } | null;
  networkHealthPct: number | null;
}

export function OverviewStats({
  customerCount,
  activeTicketsCount,
  waitingTicketsCount,
  techStats,
  networkHealthPct,
}: OverviewStatsProps) {
  return (
    <section className="overview-stats-grid" aria-label="Ringkasan Operasional Utama">
      {/* Metric 1: Pelanggan Aktif */}
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="network" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Pelanggan aktif</span>
              <div className="stat-card-value">{customerCount ?? '—'}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Total pelanggan terdaftar</span>
          </div>
        </div>
      </article>

      {/* Metric 2: Tiket Aktif */}
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="ticket" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Tiket aktif</span>
              <div className="stat-card-value">{activeTicketsCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {waitingTicketsCount} menunggu verifikasi teknisi
            </span>
          </div>
        </div>
      </article>

      {/* Metric 3: Teknisi di Lapangan */}
      <article className="stat-card">
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="wrench" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Teknisi di lapangan</span>
              <div className="stat-card-value">{techStats ? techStats.active : '—'}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {techStats ? `dari ${techStats.total} teknisi terdaftar` : 'Menghitung teknisi terdaftar'}
            </span>
          </div>
        </div>
      </article>

      {/* Metric 4: Kesehatan Jaringan */}
      <article className="stat-card stat-card-health">
        <div className="stat-card-inner">
          <div className="stat-card-top health-top">
            <div className="health-left">
              <span className="stat-card-icon-round">
                <Icon name="shield" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Kesehatan jaringan</span>
                <div className="stat-card-value">
                  {networkHealthPct !== null ? `${networkHealthPct}%` : '—'}
                </div>
              </div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">rasio redaman normal pada sistem</span>
          </div>
        </div>
      </article>
    </section>
  );
}
