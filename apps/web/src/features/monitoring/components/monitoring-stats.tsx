import React from 'react';
import { Icon } from '@/components/ui/Icon';

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
            <span className="stat-card-icon-round">
              <Icon name="activity" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total Laporan Masuk</span>
              <div className="stat-card-value">{totalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Stream aktif via Redis Pub/Sub</span>
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
            <span className="stat-card-icon-round">
              <Icon name="check" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Normal (-15 s/d -22 dBm)</span>
              <div className="stat-card-value">{normalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Optimal · Kualitas optik standar</span>
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
            <span className="stat-card-icon-round">
              <Icon name="alert" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Warning (-22.1 s/d -25 dBm)</span>
              <div className="stat-card-value">{warningCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Perlu Pantau · Potensi bending/kotor</span>
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
        aria-label="Filter laporan redaman kritis"
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round">
              <Icon name="zap" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Critical (&lt; -25 dBm / Drop)</span>
              <div className="stat-card-value">{criticalCount}</div>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Insiden Drop · Investigasi segera NOC</span>
          </div>
        </div>
      </article>
    </section>
  );
}
