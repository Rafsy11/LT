'use client';

import React, { useRef } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { TelemetryStreamSkeletonRows } from '@/components/ui/PageSkeleton';
import { SearchInput } from '@/components/ui/search-input';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import type { SseState } from '../hooks/use-monitoring';
import {
  classifyMonitoringDbm,
  getSeverityLabel,
  isAttenuationMeasured,
  resolveValidationSummary,
  type LiveReportItem,
  type MonitoringTab,
} from '../utils/monitoring-telemetry';

const STREAM_SKELETON_ROW_COUNT = 5;

export interface TelemetryStreamPanelProps {
  search: string;
  setSearch: (value: string) => void;
  cluster: string;
  setCluster: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  techFilter: string;
  setTechFilter: (value: string) => void;
  availableTechs: string[];
  tab: MonitoringTab;
  setTab: (tab: MonitoringTab) => void;
  scopedReportsCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  unmeasuredCount: number;
  filteredReports: LiveReportItem[];
  loading: boolean;
  activeReport: LiveReportItem | null;
  onSelectReport: (report: LiveReportItem) => void;
  getMeterPercentage: (dbm: number | null | undefined) => number;
  formatTimestamp: (dateStr: string) => string;
  sseState: SseState;
  reconnectCountdown: number;
  lastHeartbeat: string;
  autoFollowLive: boolean;
  setAutoFollowLive: (enabled: boolean) => void;
  pendingLiveUpdates: number;
  onJumpToLatest: () => void;
}

interface TabOption {
  value: MonitoringTab;
  label: string;
  count: number;
}

export function TelemetryStreamPanel({
  search,
  setSearch,
  cluster,
  setCluster,
  typeFilter,
  setTypeFilter,
  techFilter,
  setTechFilter,
  availableTechs,
  tab,
  setTab,
  scopedReportsCount,
  normalCount,
  warningCount,
  criticalCount,
  unmeasuredCount,
  filteredReports,
  loading,
  activeReport,
  onSelectReport,
  getMeterPercentage,
  formatTimestamp,
  sseState,
  reconnectCountdown,
  lastHeartbeat,
  autoFollowLive,
  setAutoFollowLive,
  pendingLiveUpdates,
  onJumpToLatest,
}: TelemetryStreamPanelProps) {
  const { clusters } = useClusterOptions();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabOptions: TabOption[] = [
    { value: 'Semua', label: 'Semua', count: scopedReportsCount },
    { value: 'Normal', label: 'Normal', count: normalCount },
    { value: 'Warning', label: 'Peringatan', count: warningCount },
    { value: 'Critical', label: 'Kritis', count: criticalCount },
    { value: 'Unmeasured', label: 'Belum Diukur', count: unmeasuredCount },
  ];

  const hasActiveFilter =
    Boolean(search.trim()) ||
    cluster !== 'Semua cluster' ||
    typeFilter !== 'Semua tipe' ||
    techFilter !== 'Semua teknisi' ||
    tab !== 'Semua';

  const handleSelectTab = (nextTab: MonitoringTab, index: number) => {
    setTab(nextTab);
    tabRefs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null;
    if (e.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % tabOptions.length;
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + tabOptions.length) % tabOptions.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = tabOptions.length - 1;
    }

    if (targetIndex !== null) {
      e.preventDefault();
      const targetTab = tabOptions[targetIndex];
      setTab(targetTab.value);
      const targetEl = tabRefs.current[targetIndex];
      if (targetEl) {
        targetEl.focus();
        targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  };

  const resetAllFilters = () => {
    setSearch('');
    setCluster('Semua cluster');
    setTypeFilter('Semua tipe');
    setTechFilter('Semua teknisi');
    setTab('Semua');
  };

  const connectionFooterText =
    sseState === 'LIVE_CONNECTED'
      ? 'Pembaruan real-time aktif'
      : sseState === 'CONNECTING'
        ? 'Menghubungkan pembaruan real-time...'
        : sseState === 'RECONNECTING'
          ? `Menyambung ulang pembaruan (${reconnectCountdown}d)...`
          : 'Pembaruan real-time terputus. Gunakan tombol Muat Ulang di atas.';

  return (
    <section className="noc-stream-panel" aria-label="Aliran Telemetri Redaman">
      <h2 className="sr-only">Aliran Telemetri Redaman</h2>

      {/* Stream Toolbar */}
      <header className="noc-stream-toolbar">
        <div className="noc-toolbar-top">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari pelanggan, nomor SIA, tiket, ODP, atau teknisi..."
            ariaLabel="Cari laporan telemetri"
            className="noc-search-box"
          />

          <div className="noc-filters-group">
            <select
              className="noc-select"
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filter Cluster"
            >
              <option value="Semua cluster">Semua Cluster</option>
              {clusters.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name} ({item.clusterCode})
                </option>
              ))}
            </select>

            <select
              className="noc-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter Tipe Work Order"
            >
              <option value="Semua tipe">Semua Tipe</option>
              <option value="Pasang baru">Pasang Baru (PSB)</option>
              <option value="Maintenance">Maintenance</option>
            </select>

            <select
              className="noc-select"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              aria-label="Filter Teknisi Lapangan"
            >
              <option value="Semua teknisi">Semua Teknisi</option>
              {availableTechs.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="noc-toolbar-bottom">
          <div className="noc-status-tabs" role="tablist" aria-label="Filter Kategori Redaman">
            {tabOptions.map((option, idx) => {
              const isSelected = tab === option.value;
              return (
                <button
                  key={option.value}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  id={`monitoring-tab-${option.value.toLowerCase()}`}
                  className="noc-tab-btn"
                  onClick={() => handleSelectTab(option.value, idx)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                >
                  <span>{option.label}</span>
                  <span className="noc-tab-count">{option.count}</span>
                </button>
              );
            })}
          </div>

          <div className="noc-toolbar-meta">
            <label className="noc-autofollow-toggle">
              <input
                type="checkbox"
                checked={autoFollowLive}
                onChange={(e) => setAutoFollowLive(e.target.checked)}
              />
              <span>Ikuti otomatis</span>
            </label>
            <span className="noc-stream-count-text">
              Menampilkan <strong>{filteredReports.length}</strong> dari {scopedReportsCount}
            </span>
          </div>
        </div>

        {pendingLiveUpdates > 0 && (
          <div className="noc-live-cue" role="status" aria-live="polite">
            <span className="noc-live-cue-text">
              <Icon name="activity" size={14} />
              <span>{pendingLiveUpdates} laporan baru masuk ke aliran pantauan</span>
            </span>
            <button type="button" className="noc-live-cue-btn" onClick={onJumpToLatest}>
              Lihat Terbaru
            </button>
          </div>
        )}
      </header>

      {/* Semantic Responsive Table with Container Query Reflow */}
      <div
        className="noc-stream-scroll-wrap"
        tabIndex={0}
        role="region"
        aria-labelledby="noc-stream-table-caption"
      >
        <table className="noc-stream-table">
          <caption id="noc-stream-table-caption" className="sr-only">
            Daftar aliran laporan redaman optik lapangan
          </caption>
          <thead>
            <tr>
              <th scope="col">Waktu</th>
              <th scope="col">Pelanggan &amp; SIA</th>
              <th scope="col">ODP / Port</th>
              <th scope="col">Teknisi</th>
              <th scope="col">Redaman</th>
              <th scope="col">Validasi</th>
              <th scope="col" className="col-action-head">
                Aksi
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <TelemetryStreamSkeletonRows count={STREAM_SKELETON_ROW_COUNT} />
            ) : filteredReports.length === 0 ? (
              <tr className="noc-empty-row">
                <td colSpan={7} className="noc-empty-cell">
                  <EmptyState
                    icon="activity"
                    title="Tidak ada laporan telemetri"
                    description={
                      hasActiveFilter
                        ? 'Tidak ditemukan laporan yang sesuai dengan kombinasi pencarian dan filter aktif.'
                        : 'Belum ada laporan pengukuran OPM yang masuk pada wilayah Anda.'
                    }
                    actionLabel={hasActiveFilter ? 'Reset Filter' : undefined}
                    actionIcon="refresh"
                    onAction={hasActiveFilter ? resetAllFilters : undefined}
                    size="compact"
                  />
                </td>
              </tr>
            ) : (
              filteredReports.map((report) => {
                const severity = classifyMonitoringDbm(report.currentAttenuation);
                const severityClass = severity.toLowerCase();
                const isMeasured = isAttenuationMeasured(report.currentAttenuation);
                const meterPct = getMeterPercentage(report.currentAttenuation);
                const validation = resolveValidationSummary(report);
                const isSelected = activeReport?.ticketNumber === report.ticketNumber;
                const isCritical = severity === 'Critical';

                return (
                  <tr
                    key={report.id || report.ticketNumber}
                    className={`noc-stream-row ${isSelected ? 'active' : ''} ${isCritical ? 'critical-row' : ''}`}
                    onClick={() => onSelectReport(report)}
                  >
                    <td data-label="Waktu" className="noc-cell-time">
                      <div className="col-time-status">
                        <span
                          className={`optical-status-dot optical-status-dot--${severityClass}`}
                          aria-hidden="true"
                        />
                        <time dateTime={report.createdAt}>{formatTimestamp(report.createdAt)}</time>
                        {report.isLiveIncoming && <span className="noc-new-chip">Baru</span>}
                      </div>
                    </td>

                    <th scope="row" className="noc-cell-customer">
                      <div className="col-customer">
                        <span className="col-customer-name" title={report.customerName}>
                          {report.customerName}
                        </span>
                        <div className="col-customer-meta">
                          <code>{report.siaNumber || report.ticketNumber}</code>
                          <span className="meta-separator" aria-hidden="true">
                            ·
                          </span>
                          <span className="ticket-type-label">{report.ticketType}</span>
                          {report.status === 'Menunggu verifikasi' && (
                            <span className="noc-review-chip">Verifikasi</span>
                          )}
                        </div>
                      </div>
                    </th>

                    <td data-label="ODP / Port" className="noc-cell-network">
                      <div className="col-network">
                        <div className="col-network-odp">
                          <span>{report.splitterCode || 'Belum ditautkan'}</span>
                          {report.portNumber ? (
                            <span className="port-tag">P{report.portNumber}</span>
                          ) : null}
                        </div>
                        <div className="col-network-cluster">{report.cluster || '-'}</div>
                      </div>
                    </td>

                    <td data-label="Teknisi" className="noc-cell-tech">
                      <div className="col-tech">
                        <span className="col-tech-avatar" aria-hidden="true">
                          {report.techInitials || 'TK'}
                        </span>
                        <span className="col-tech-name" title={report.assignedTech}>
                          {report.assignedTech || 'Belum ditugaskan'}
                        </span>
                      </div>
                    </td>

                    <td data-label="Redaman" className="noc-cell-signal">
                      <div className="col-signal">
                        <div className="col-signal-top">
                          <span className={`col-signal-value col-signal-value--${severityClass}`}>
                            {isMeasured ? `${report.currentAttenuation.toFixed(1)} dBm` : 'Belum diukur'}
                          </span>
                          {isMeasured && (
                            <span className={`col-signal-label col-signal-label--${severityClass}`}>
                              {getSeverityLabel(severity)}
                            </span>
                          )}
                        </div>
                        <div
                          className="col-signal-bar-mini"
                          aria-hidden="true"
                        >
                          <div
                            className={`col-signal-fill-mini col-signal-fill-mini--${severityClass}`}
                            style={{ width: `${meterPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td data-label="Validasi" className="noc-cell-validation">
                      <div className="col-validation">
                        <span
                          className={`validation-tag-clean validation-tag-clean--${validation.gpsStatus}`}
                          title={validation.gpsTitle}
                        >
                          {validation.gpsCompactLabel}
                        </span>
                        <span
                          className={`opm-proof-check opm-proof-check--${validation.opmStatus}`}
                          title={validation.opmTitle}
                        >
                          {validation.opmCompactLabel}
                        </span>
                      </div>
                    </td>

                    <td className="col-action noc-cell-action">
                      <button
                        className={`inspect-trigger-btn ${isSelected ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectReport(report);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Inspeksi telemetri tiket ${report.ticketNumber} atas nama ${report.customerName}`}
                      >
                        {isSelected ? 'Terpilih' : 'Inspeksi'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Honest Stream Footer */}
      <footer className="monitoring-info-strip">
        <span className={`monitoring-footer-state monitoring-footer-state--${sseState.toLowerCase()}`}>
          {connectionFooterText}
        </span>
        <span>
          Sinkronisasi terakhir: <strong>{lastHeartbeat}</strong>
        </span>
      </footer>
    </section>
  );
}
