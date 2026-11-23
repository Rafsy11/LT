import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { MonitoringTab } from '../utils/monitoring-telemetry';

export interface MonitoringStatsProps {
  totalCount: number;
  measuredCount: number;
  unmeasuredCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  activeTab: MonitoringTab;
  onSelectTab: (tab: MonitoringTab) => void;
}

function formatMeasuredShare(count: number, measuredCount: number): string {
  if (measuredCount <= 0) return 'Belum ada pengukuran';
  const pct = Math.round((count / measuredCount) * 100);
  return `${pct}% dari terukur`;
}

export function MonitoringStats({
  totalCount,
  measuredCount,
  unmeasuredCount,
  normalCount,
  warningCount,
  criticalCount,
  activeTab,
  onSelectTab,
}: MonitoringStatsProps) {
  const totalSummary =
    totalCount === 0
      ? 'Belum ada laporan pada filter ini'
      : unmeasuredCount > 0
        ? `${measuredCount} terukur · ${unmeasuredCount} belum diukur`
        : `${measuredCount} laporan sudah terukur OPM`;

  return (
    <section className="monitoring-stats-grid" aria-label="Ringkasan Kondisi Redaman Optik">
      <button
        type="button"
        className={`stat-card stat-card--total ${activeTab === 'Semua' ? 'active' : ''}`}
        onClick={() => onSelectTab('Semua')}
        aria-pressed={activeTab === 'Semua'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="activity" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Total Laporan</span>
              <span className="stat-card-value">{totalCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">{totalSummary}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--normal ${activeTab === 'Normal' ? 'active' : ''}`}
        onClick={() => onSelectTab('Normal')}
        aria-pressed={activeTab === 'Normal'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="check" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Normal (-10 s/d -25 dBm)</span>
              <span className="stat-card-value">{normalCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {formatMeasuredShare(normalCount, measuredCount)} · Kondisi optimal
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--warning ${activeTab === 'Warning' ? 'active' : ''}`}
        onClick={() => onSelectTab('Warning')}
        aria-pressed={activeTab === 'Warning'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="alert" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Peringatan (-25,1 s/d -28 dBm)</span>
              <span className="stat-card-value">{warningCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {formatMeasuredShare(warningCount, measuredCount)} · Mendekati ambang batas
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--critical ${activeTab === 'Critical' ? 'active' : ''}`}
        onClick={() => onSelectTab('Critical')}
        aria-pressed={activeTab === 'Critical'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="zap" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Kritis (&lt; -28 atau &gt; -10 dBm)</span>
              <span className="stat-card-value">{criticalCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {criticalCount > 0
                ? `${formatMeasuredShare(criticalCount, measuredCount)} · Perlu investigasi segera`
                : 'Tidak ada insiden redaman kritis'}
            </span>
          </div>
        </div>
      </button>
    </section>
  );
}
