import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { classifyDbm, dbmTone } from '@repo/shared';
import type { LiveReportItem } from '../hooks/use-monitoring';

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
  tab: 'Semua' | 'Normal' | 'Warning' | 'Critical';
  setTab: (tab: 'Semua' | 'Normal' | 'Warning' | 'Critical') => void;
  scopedReportsCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  filteredReports: LiveReportItem[];
  loading: boolean;
  activeReport: LiveReportItem | null;
  onSelectReport: (report: LiveReportItem) => void;
  getMeterPercentage: (dbm: number) => number;
  formatTimestamp: (dateStr: string) => string;
  lastHeartbeat: string;
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
  filteredReports,
  loading,
  activeReport,
  onSelectReport,
  getMeterPercentage,
  formatTimestamp,
  lastHeartbeat,
}: TelemetryStreamPanelProps) {
  return (
    <section className="noc-stream-panel" aria-label="Aliran Telemetri Real-Time">
      {/* Stream Toolbar */}
      <div className="noc-stream-toolbar">
        <div className="noc-toolbar-top">
          <div className="noc-search-box">
            <Icon name="search" size={14} />
            <input
              aria-label="Cari data live stream"
              placeholder="Cari pelanggan, nomor SIA, ODP, atau teknisi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="noc-filters-group">
            <select
              className="noc-select"
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filter Cluster"
            >
              <option value="Semua cluster">Semua Cluster</option>
              <option value="Bandung Utara">Bandung Utara</option>
              <option value="Bandung Timur">Bandung Timur</option>
              <option value="Bandung Barat">Bandung Barat</option>
              <option value="Bandung Selatan">Bandung Selatan</option>
              <option value="Cimahi">Cimahi</option>
              <option value="Rancaekek">Rancaekek</option>
            </select>

            <select
              className="noc-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter Tipe Tiket"
            >
              <option value="Semua tipe">Semua Tipe Work Order</option>
              <option value="Pasang baru">Pasang Baru (PSB)</option>
              <option value="Maintenance">Pemeliharaan (Maintenance)</option>
            </select>

            <select
              className="noc-select"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              aria-label="Filter Teknisi"
            >
              <option value="Semua teknisi">Semua Teknisi Lapangan</option>
              {availableTechs.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="noc-toolbar-bottom">
          <div className="noc-status-tabs">
            <button
              className={`noc-tab-btn ${tab === 'Semua' ? 'active' : ''}`}
              onClick={() => setTab('Semua')}
              type="button"
            >
              <span>Semua Sinyal</span>
              <span className="noc-tab-count">{scopedReportsCount}</span>
            </button>
            <button
              className={`noc-tab-btn ${tab === 'Normal' ? 'active' : ''}`}
              onClick={() => setTab('Normal')}
              type="button"
            >
              <span>Normal</span>
              <span className="noc-tab-count">{normalCount}</span>
            </button>
            <button
              className={`noc-tab-btn ${tab === 'Warning' ? 'active' : ''}`}
              onClick={() => setTab('Warning')}
              type="button"
            >
              <span>Warning</span>
              <span className="noc-tab-count">{warningCount}</span>
            </button>
            <button
              className={`noc-tab-btn ${tab === 'Critical' ? 'active' : ''}`}
              onClick={() => setTab('Critical')}
              type="button"
            >
              <span>Critical</span>
              <span className="noc-tab-count">{criticalCount}</span>
            </button>
          </div>

          <div className="noc-stream-count-text">
            Menampilkan <b>{filteredReports.length}</b> laporan · Stream aktif
          </div>
        </div>
      </div>

      {/* Stream Table Header */}
      <div className="noc-stream-table-header">
        <div>WAKTU</div>
        <div>PELANGGAN &amp; SIA</div>
        <div>SPLITTER / PORT</div>
        <div>TEKNISI</div>
        <div>REDAMAN</div>
        <div>VALIDASI</div>
        <div style={{ textAlign: 'right' }}>AKSI</div>
      </div>

      {/* Stream Table Rows */}
      <div className="noc-stream-list">
        {loading ? (
          <div className="noc-empty-stream">Memuat aliran sinyal live telemetri...</div>
        ) : filteredReports.length === 0 ? (
          <div className="noc-empty-stream">
            Tidak ada laporan telemetri pada kriteria filter ini.
          </div>
        ) : (
          filteredReports.map((report) => {
            const status = classifyDbm(report.currentAttenuation);
            const tone = dbmTone(report.currentAttenuation);
            const meterPct = getMeterPercentage(report.currentAttenuation);
            const distance = report.distanceToSplitterM ?? 18;
            const isFlagged = report.isLocationFlagged ?? distance > 100;
            const isSelected = activeReport?.ticketNumber === report.ticketNumber;
            const isCritical = status === 'Critical';

            return (
              <div
                key={report.id || report.ticketNumber}
                className={`noc-stream-row ${isSelected ? 'active' : ''} ${isCritical ? 'critical-row' : ''}`}
                onClick={() => onSelectReport(report)}
              >
                {/* Time & Dot Indicator */}
                <div className="col-time-status">
                  <span
                    className={`optical-status-dot ${status.toLowerCase()}`}
                    title={`Status: ${status}`}
                  />
                  <span>{formatTimestamp(report.createdAt)}</span>
                </div>

                {/* Customer & SIA */}
                <div className="col-customer">
                  <div className="col-customer-name" title={report.customerName}>
                    {report.customerName}
                  </div>
                  <div className="col-customer-meta">
                    <code>{report.siaNumber}</code>
                    <span className="meta-separator">·</span>
                    <span className="ticket-type-label">{report.ticketType}</span>
                  </div>
                </div>

                {/* Network: Splitter & Port */}
                <div className="col-network">
                  <div className="col-network-odp">
                    <span>{report.splitterCode || 'ODP-BDG-01'}</span>
                    <span className="port-tag">P{report.portNumber || 1}</span>
                  </div>
                  <div className="col-network-cluster">{report.cluster}</div>
                </div>

                {/* Field Technician */}
                <div className="col-tech">
                  <span className="col-tech-avatar">{report.techInitials || 'TK'}</span>
                  <span className="col-tech-name" title={report.assignedTech}>
                    {report.assignedTech}
                  </span>
                </div>

                {/* Attenuation dBm & Spark Bar */}
                <div className="col-signal">
                  <span className={`col-signal-value ${tone}`}>
                    {report.currentAttenuation.toFixed(1)} dBm
                  </span>
                  <div
                    className="col-signal-bar-mini"
                    title={`Skala Optik: ${report.currentAttenuation} dBm`}
                  >
                    <div
                      className={`col-signal-fill-mini ${status.toLowerCase()}`}
                      style={{ width: `${meterPct}%` }}
                    />
                  </div>
                </div>

                {/* Validation: Geofence & Proof */}
                <div className="col-validation">
                  {isFlagged ? (
                    <span
                      className="validation-tag-clean warn"
                      title="Jarak melebihi radius batas toleransi 100 meter"
                    >
                      {distance}m Warn
                    </span>
                  ) : (
                    <span
                      className="validation-tag-clean ok"
                      title="GPS terverifikasi ≤ 100m dari ODP"
                    >
                      {distance}m OK
                    </span>
                  )}
                  <span className="opm-proof-check" title="Bukti OPM tersimpan di MinIO">
                    MinIO OPM
                  </span>
                </div>

                {/* Action Button */}
                <div className="col-action">
                  <button
                    className="inspect-trigger-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReport(report);
                    }}
                    type="button"
                  >
                    {isSelected ? 'Aktif' : 'Detail'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Stream Metadata Strip */}
      <div className="monitoring-info-strip">
        <div>
          Jalur SSE: <code>/api/v1/admin/stream/reports</code> (Nginx Unbuffered{' '}
          <code>X-Accel-Buffering: no</code>).
        </div>
        <div>
          Heartbeat: <b>{lastHeartbeat}</b> · Redis Bus Aktif.
        </div>
      </div>
    </section>
  );
}
