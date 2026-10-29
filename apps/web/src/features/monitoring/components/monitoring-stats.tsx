import React from 'react';

export interface MonitoringStatsProps {
  totalCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  onSelectTab: (tab: 'Semua' | 'Normal' | 'Warning' | 'Critical') => void;
}

export function MonitoringStats({
  totalCount,
  normalCount,
  warningCount,
  criticalCount,
  onSelectTab,
}: MonitoringStatsProps) {
  return (
    <section className="monitoring-stats-grid" aria-label="Statistik Telemetri Redaman Optik">
      <article className="stat-card" onClick={() => onSelectTab('Semua')}>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <span className="stat-card-label">Total Laporan Masuk</span>
              <div className="stat-card-value">{totalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-card-caption">Stream aktif via Redis Pub/Sub</span>
          </div>
        </div>
      </article>

      <article className="stat-card" onClick={() => onSelectTab('Normal')}>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot normal" />
                <span className="stat-card-label">Normal (-15 s/d -22 dBm)</span>
              </div>
              <div className="stat-card-value">{normalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-card-caption">Optimal · Kualitas optik standar</span>
          </div>
        </div>
      </article>

      <article className="stat-card" onClick={() => onSelectTab('Warning')}>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot warning" />
                <span className="stat-card-label">Warning (-22.1 s/d -25 dBm)</span>
              </div>
              <div className="stat-card-value">{warningCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-card-caption">Perlu Pantau · Potensi bending/kotor</span>
          </div>
        </div>
      </article>

      <article className="stat-card" onClick={() => onSelectTab('Critical')}>
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot critical" />
                <span className="stat-card-label">Critical (&lt; -25 dBm / Drop)</span>
              </div>
              <div className="stat-card-value">{criticalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="stat-card-caption">Insiden Drop · Investigasi segera NOC</span>
          </div>
        </div>
      </article>
    </section>
  );
}

