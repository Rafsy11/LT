import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ATTENUATION_THRESHOLDS,
  type ClusterListItem,
  type NetworkAuditResult,
} from '@repo/shared';
import type { AttenuationMeta, OdpHistoryLogItem } from '../hooks/use-network';

export interface PortDetailPanelProps {
  activeTab: 'riwayat' | 'audit';
  activeSplitter: ClusterListItem;
  getAttenuationMeta: (att: number | undefined) => AttenuationMeta;
  historyTypeFilter: 'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN';
  setHistoryTypeFilter: (filter: 'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN') => void;
  odpHistoryLogs: OdpHistoryLogItem[];
  historyLoading?: boolean;
  auditRunning: boolean;
  auditResult?: NetworkAuditResult | null;
  auditTimestamp: string;
  handleRunAudit: () => void;
  onSelectAuditSplitter?: (splitterCode: string, clusterCode?: string) => void;
}

const MAX_AUDIT_FINDINGS = 15;

/**
 * Secondary operational tabs for `/network` (`Riwayat` and `Audit Integritas`).
 * Free of internal database/PRD jargon, with actionable jump links on audit findings.
 *
 * @param props - Active secondary tab, history logs, audit state, and ODP jump callback.
 * @returns Rendered History or Integrity Audit tab pane.
 * @example
 * <PortDetailPanel activeTab="audit" activeSplitter={activeSplitter} ... />
 */
export function PortDetailPanel({
  activeTab,
  activeSplitter,
  getAttenuationMeta,
  historyTypeFilter,
  setHistoryTypeFilter,
  odpHistoryLogs,
  historyLoading = false,
  auditRunning,
  auditResult = null,
  auditTimestamp,
  handleRunAudit,
  onSelectAuditSplitter,
}: PortDetailPanelProps) {
  if (activeTab === 'riwayat') {
    const visibleLogs = odpHistoryLogs.filter(
      (log) => historyTypeFilter === 'ALL' || log.type === historyTypeFilter,
    );

    return (
      <section className="odp-tab-pane" aria-label="Riwayat Aktivitas ODP">
        <header className="odp-subpane-header">
          <div>
            <h3 className="odp-subpane-title">
              Riwayat Aktivitas Operasional {activeSplitter.splitterCode}
            </h3>
            <p className="odp-subpane-desc">
              Catatan historis tiket maintenance, pemasangan baru (PSB), dan penarikan oleh teknisi.
            </p>
          </div>

          <nav aria-label="Filter tipe riwayat" className="odp-history-filter-nav">
            {(['ALL', 'MAINTENANCE', 'PEMASANGAN', 'PENARIKAN'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                className={`odp-port-filter-btn ${historyTypeFilter === filterKey ? 'active' : ''}`}
                onClick={() => setHistoryTypeFilter(filterKey)}
              >
                {filterKey === 'ALL' ? 'Semua Log' : filterKey}
              </button>
            ))}
          </nav>
        </header>

        {historyLoading ? (
          <div className="odp-loading-note" role="status">
            Memuat riwayat aktivitas ODP...
          </div>
        ) : visibleLogs.length === 0 ? (
          <EmptyState
            icon="clock"
            title={`Belum ada riwayat aktivitas untuk ODP ${activeSplitter.splitterCode}`}
            description="Riwayat otomatis tercatat setiap kali teknisi menyelesaikan pengukuran redaman atau mutasi port."
            actionLabel={historyTypeFilter !== 'ALL' ? 'Tampilkan Semua Log' : undefined}
            actionIcon="refresh"
            onAction={
              historyTypeFilter !== 'ALL' ? () => setHistoryTypeFilter('ALL') : undefined
            }
            size="compact"
          />
        ) : (
          <ol className="timeline-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {visibleLogs.map((log, idx) => (
              <li key={`${log.ticketNumber}-${log.portNumber}-${idx}`} className="timeline-entry">
                <div className="timeline-entry-dot" aria-hidden="true" />
                <article className="timeline-entry-card">
                  <header className="timeline-entry-head">
                    <div className="timeline-entry-title-group">
                      <span
                        className={`odp-port-status-badge ${
                          log.type === 'MAINTENANCE'
                            ? 'is-normal'
                            : log.type === 'PEMASANGAN'
                              ? 'is-psb'
                              : 'is-warning'
                        }`}
                      >
                        {log.type}
                      </span>
                      <span className="timeline-entry-title">
                        Port P{String(log.portNumber).padStart(2, '0')} :{' '}
                        {log.customerName || 'Alokasi Baru'}
                      </span>
                    </div>
                    <time className="timeline-entry-date">{log.date}</time>
                  </header>

                  <p className="timeline-entry-notes">{log.notes}</p>

                  <footer className="timeline-entry-meta">
                    <span>
                      Teknisi: <strong>{log.technician}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Tiket: <code>{log.ticketNumber}</code>
                    </span>
                    {log.attenuationDelta && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="ui-text-primary" style={{ fontWeight: 600 }}>
                          {log.attenuationDelta}
                        </span>
                      </>
                    )}
                  </footer>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  if (activeTab === 'audit') {
    const goodLimitDb = ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB;

    return (
      <section className="odp-tab-pane" aria-label="Audit Integritas Jaringan">
        <article className="audit-overview-card">
          <header className="audit-overview-header">
            <div>
              <div className="audit-badge-row">
                <span className="odp-port-status-badge is-normal">
                  <Icon name="shield" size={12} />
                  <span>Validasi Alokasi Port Unik Aktif</span>
                </span>
              </div>
              <h3 className="odp-subpane-title" style={{ marginTop: '8px' }}>
                Audit Integritas Kapasitas &amp; Redaman Jaringan
              </h3>
              <p className="odp-subpane-desc" style={{ marginTop: '3px' }}>
                Memeriksa bentrokan alokasi port ganda, kepenuhan kapasitas splitter, redaman di
                atas {goodLimitDb} dB, dan konsistensi koordinat ODP di seluruh cluster.
              </p>
            </div>

            <button
              type="button"
              className="btn-inspect-ticket-action"
              onClick={handleRunAudit}
              disabled={auditRunning}
            >
              <Icon name="refresh" size={13} />
              <span>{auditRunning ? 'Memeriksa Jaringan...' : 'Jalankan Audit Jaringan'}</span>
            </button>
          </header>

          <section className="audit-kpi-grid" aria-label="Ringkasan hasil audit">
            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Bentrok Port Ganda</div>
              <div
                className={`audit-kpi-box-val ${
                  auditResult && auditResult.doubleBookedPorts > 0 ? 'ui-text-danger' : 'ui-text-ok'
                }`}
              >
                {auditResult ? `${auditResult.doubleBookedPorts} Terdeteksi` : 'Belum Diaudit'}
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Port Terpakai ODP Ini</div>
              <div className="audit-kpi-box-val ui-text-primary">
                {activeSplitter.usedPorts}/{activeSplitter.maxPorts} Port
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Temuan Anomali Global</div>
              <div
                className={`audit-kpi-box-val ${
                  auditResult && auditResult.findings.length > 0 ? 'ui-text-danger' : ''
                }`}
              >
                {auditResult ? `${auditResult.findings.length} Temuan` : 'Menunggu Audit'}
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Verifikasi Terakhir</div>
              <div className="audit-kpi-box-val" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                {auditTimestamp}
              </div>
            </div>
          </section>
        </article>

        {auditResult && auditResult.findings.length > 0 && (
          <div className="odp-audit-findings-wrap">
            <h4 className="odp-audit-section-title">
              Temuan Operasional ({auditResult.findings.length})
            </h4>
            <div
              className="table-scroll"
              style={{ borderRadius: '8px', overflowX: 'auto' }}
              tabIndex={0}
              role="region"
              aria-label="Daftar temuan audit jaringan"
            >
              <table className="odp-clean-table">
                <thead>
                  <tr>
                    <th scope="col">SEVERITAS</th>
                    <th scope="col">ODP / CLUSTER</th>
                    <th scope="col">RINGKASAN TEMUAN</th>
                    <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>
                      TINDAKAN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.findings.slice(0, MAX_AUDIT_FINDINGS).map((f) => {
                    const isCritical = f.severity === 'critical';
                    return (
                      <tr key={f.id} className="odp-table-data-row">
                        <td>
                          <span
                            className={`odp-port-status-badge ${
                              isCritical ? 'is-critical' : 'is-warning'
                            }`}
                          >
                            <Icon name="alert" size={11} />
                            <span>{isCritical ? 'Kritis' : 'Peringatan'}</span>
                          </span>
                        </td>
                        <td>
                          <strong>{f.splitterCode}</strong>
                          <span className="odp-audit-cluster-sub"> ({f.clusterCode})</span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <strong>{f.title}:</strong> {f.description}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                          <div className="odp-audit-row-actions">
                            {onSelectAuditSplitter && (
                              <button
                                type="button"
                                className="action-detail-link"
                                onClick={() =>
                                  onSelectAuditSplitter(f.splitterCode, f.clusterCode)
                                }
                              >
                                Buka ODP
                              </button>
                            )}
                            <Link
                              href={`/maps?odp=${encodeURIComponent(f.splitterCode)}`}
                              className="action-detail-link"
                            >
                              Peta
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Active ODP Port Allocation Integrity Table */}
        <div className="odp-audit-findings-wrap">
          <h4 className="odp-audit-section-title">
            Status Alokasi Port {activeSplitter.splitterCode}
          </h4>
          <div
            className="table-scroll"
            style={{ borderRadius: '8px', overflowX: 'auto' }}
            tabIndex={0}
            role="region"
            aria-label="Tabel integritas alokasi port ODP"
          >
            <table className="odp-clean-table">
              <thead>
                <tr>
                  <th scope="col">PORT</th>
                  <th scope="col">ALOKASI</th>
                  <th scope="col">PELANGGAN / SIA</th>
                  <th scope="col">REDAMAN</th>
                  <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>
                    STATUS INTEGRITAS
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeSplitter.ports.map((port) => {
                  const isOccupied = port.isOccupied;
                  const attMeta = getAttenuationMeta(port.attenuation);

                  return (
                    <tr key={port.portNumber} className="odp-table-data-row">
                      <td>
                        <span className="port-id-chip-clean">
                          P{String(port.portNumber).padStart(2, '0')}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}
                        >
                          {isOccupied ? 'Terisi' : 'Siap PSB'}
                        </span>
                      </td>
                      <td>
                        {isOccupied ? (
                          <div>
                            <div className="customer-name-bold">{port.customerName}</div>
                            <div className="customer-sia-code">{port.siaNumber}</div>
                          </div>
                        ) : (
                          <span className="ui-text-muted">Port Siap Alokasi</span>
                        )}
                      </td>
                      <td>
                        {isOccupied && port.attenuation != null && port.attenuation !== 0 ? (
                          <span className="redaman-value-clean">{port.attenuation.toFixed(1)} dBm</span>
                        ) : (
                          <span className="ui-text-muted">-</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                        {isOccupied ? (
                          <span
                            className={`odp-port-status-badge ${
                              attMeta.status === 'critical' ? 'is-critical' : 'is-normal'
                            }`}
                          >
                            <Icon
                              name={attMeta.status === 'critical' ? 'alert' : 'check'}
                              size={11}
                            />
                            <span>
                              {attMeta.status === 'critical'
                                ? `Perlu Perbaikan (> ${goodLimitDb} dB)`
                                : 'Alokasi Valid'}
                            </span>
                          </span>
                        ) : (
                          <span className="odp-port-status-badge is-psb">
                            <Icon name="check" size={11} />
                            <span>Bebas Valid</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
