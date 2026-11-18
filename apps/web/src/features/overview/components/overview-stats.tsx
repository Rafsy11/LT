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
            <span className="stat-trend positive" aria-label="Kenaikan 2.5 persen">
              <span className="trend-arrow">↑</span> +2.5%
            </span>
            <span className="caption desktop-caption">Total pelanggan terdaftar</span>
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
            <span className="stat-trend neutral" aria-label="Tren netral">
              <span className="trend-arrow">↓</span> -0.0%
            </span>
            <span className="caption desktop-caption">
              {waitingTicketsCount} menunggu verifikasi
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
            <span className="stat-trend positive" aria-label="Kenaikan stabil">
              <span className="trend-arrow">↑</span> +0.0%
            </span>
            <span className="caption desktop-caption">
              {techStats ? `dari ${techStats.total} terdaftar` : 'Memuat teknisi'}
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
            <span
              className={`stat-trend ${(networkHealthPct ?? 0) >= 50 ? 'positive' : 'warning'}`}
              aria-label="Status rasio sistem"
            >
              <span className="trend-arrow">{(networkHealthPct ?? 0) >= 50 ? '↑' : '•'}</span>{' '}
              {(networkHealthPct ?? 0) >= 50 ? '+0.0%' : 'Pantauan'}
            </span>
            <span className="caption desktop-caption">rasio redaman normal</span>
          </div>
        </div>
      </article>
    </section>
  );
}
