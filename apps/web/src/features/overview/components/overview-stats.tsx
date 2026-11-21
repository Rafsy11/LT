import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface OverviewStatsProps {
  customerCount: number | null;
  activeTicketsCount: number;
  waitingTicketsCount: number;
  techStats: { total: number; active: number } | null;
  networkHealthPct: number | null;
  normalOdpCount?: number;
  measuredOdpCount?: number;
  abnormalOdpCount?: number;
}

export function OverviewStats({
  customerCount,
  activeTicketsCount,
  waitingTicketsCount,
  techStats,
  networkHealthPct,
  normalOdpCount = 0,
  measuredOdpCount = 0,
  abnormalOdpCount = 0,
}: OverviewStatsProps) {
  const healthStatusClass =
    networkHealthPct === null
      ? 'muted'
      : abnormalOdpCount > 0 || networkHealthPct < 80
        ? 'warning'
        : 'positive';

  return (
    <section className="overview-stats-grid" aria-label="Ringkasan Operasional Utama">
      {/* Metric 1: Pelanggan Aktif */}
      <article className="stat-card stat-card-customer">
        <div className="stat-card-inner">
          <div className="stat-card-header">
            <span className="stat-card-icon-glyph text-cyan">
              <Icon name="users" size={20} />
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">Pelanggan aktif</span>
            <div className="stat-card-value">{customerCount ?? '-'}</div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-meta-note">Total pelanggan terdaftar (SIA)</span>
          </div>
        </div>
      </article>

      {/* Metric 2: Tiket Aktif */}
      <article className="stat-card stat-card-tickets">
        <div className="stat-card-inner">
          <div className="stat-card-header">
            <span className="stat-card-icon-glyph text-indigo">
              <Icon name="ticket" size={20} />
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">Tiket aktif</span>
            <div className="stat-card-value">{activeTicketsCount}</div>
          </div>
          <div className="stat-card-footer">
            <span
              className={`stat-trend ${waitingTicketsCount > 0 ? 'warning' : 'positive'}`}
            >
              {waitingTicketsCount > 0 ? `${waitingTicketsCount} perlu tindak lanjut` : 'Antrean terkendali'}
            </span>
          </div>
        </div>
      </article>

      {/* Metric 3: Teknisi di Lapangan */}
      <article className="stat-card stat-card-tech">
        <div className="stat-card-inner">
          <div className="stat-card-header">
            <span className="stat-card-icon-glyph text-sky">
              <Icon name="wrench" size={20} />
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">Teknisi di lapangan</span>
            <div className="stat-card-value">{techStats ? techStats.active : '-'}</div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-meta-note">
              {techStats ? `dari ${techStats.total} teknisi terdaftar` : 'Memuat data teknisi'}
            </span>
          </div>
        </div>
      </article>

      {/* Metric 4: Kesehatan Jaringan */}
      <article className="stat-card stat-card-health">
        <div className="stat-card-inner">
          <div className="stat-card-header">
            <span className="stat-card-icon-glyph text-emerald">
              <Icon name="shield" size={20} />
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">Kesehatan Jaringan</span>
            <div className="stat-card-value">
              {networkHealthPct !== null ? `${networkHealthPct}%` : '-'}
            </div>
          </div>
          <div className="stat-card-footer">
            <span className={`stat-trend ${healthStatusClass}`}>
              {measuredOdpCount > 0
                ? `${normalOdpCount}/${measuredOdpCount} ODP <= 28 dB`
                : 'Rasio redaman normal'}
            </span>
          </div>
        </div>
      </article>
    </section>
  );
}
