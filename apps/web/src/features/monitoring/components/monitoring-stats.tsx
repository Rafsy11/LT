import React from 'react';

export interface MonitoringStatsProps {
  totalCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  activeTab?: 'Semua' | 'Normal' | 'Warning' | 'Critical';
  onSelectTab: (tab: 'Semua' | 'Normal' | 'Warning' | 'Critical') => void;
}

export function MonitoringStats({
  totalCount,
  normalCount,
  warningCount,
  criticalCount,
  activeTab,
  onSelectTab,
}: MonitoringStatsProps) {
  return (
    <section className="monitoring-stats-grid" aria-label="Statistik Telemetri Redaman Optik">
      <article
        className={`stat-card ${activeTab === 'Semua' ? 'active' : ''}`}
        onClick={() => onSelectTab('Semua')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab('Semua');
          }
        }}
        aria-label="Filter semua laporan masuk"
      >
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

      <article
        className={`stat-card ${activeTab === 'Normal' ? 'active' : ''}`}
        onClick={() => onSelectTab('Normal')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab('Normal');
          }
        }}
        aria-label="Filter laporan redaman normal"
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot normal" aria-hidden="true" />
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

      <article
        className={`stat-card ${activeTab === 'Warning' ? 'active' : ''}`}
        onClick={() => onSelectTab('Warning')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab('Warning');
          }
        }}
        aria-label="Filter laporan redaman warning"
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot warning" aria-hidden="true" />
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

      <article
        className={`stat-card ${activeTab === 'Critical' ? 'active' : ''}`}
        onClick={() => onSelectTab('Critical')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTab('Critical');
          }
        }}
        aria-label="Filter laporan redaman critical"
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <div className="stat-card-text">
              <div className="stat-card-label-with-dot">
                <span className="optical-status-dot critical" aria-hidden="true" />
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
