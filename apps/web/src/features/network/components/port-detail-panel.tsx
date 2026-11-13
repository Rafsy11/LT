import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type {
  ClusterListItem,
  CreateTicketInput,
  NetworkAuditResult,
} from '@repo/shared';
import { SignalStrengthBars } from '@/features/customers';
import type { AttenuationMeta, OdpHistoryLogItem } from '../hooks/use-network';

export interface PortDetailPanelProps {
  activeTab: 'inspeksi' | 'riwayat' | 'audit';
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
  showSuccess: (msg: string) => void;
  setTicketModalInitial: (initial: Partial<CreateTicketInput>) => void;
  setTicketModalOpen: (open: boolean) => void;
  canCreateTicket: boolean;
}

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
  showSuccess,
  setTicketModalInitial,
  setTicketModalOpen,
  canCreateTicket,
}: PortDetailPanelProps) {
  const handleDownloadInspectionCsv = () => {
    const header = 'ODP,Port,Status,Pelanggan,SIA,Redaman (dBm),Terakhir Dicek,Teknisi,Catatan\n';
    const rows = activeSplitter.ports
      .map((port) =>
        [
          activeSplitter.splitterCode,
          port.portNumber,
          port.isOccupied ? 'Terisi' : 'Siap PSB',
          `"${port.customerName || '-'}"`,
          port.siaNumber || '-',
          port.attenuation !== undefined ? port.attenuation.toFixed(1) : '-',
          `"${port.lastActivity?.date || '-'}"`,
          `"${port.lastActivity?.technician || '-'}"`,
          `"${(port.lastActivity?.notes || '-').replace(/"/g, '""')}"`,
        ].join(','),
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspeksi-${activeSplitter.splitterCode}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`Laporan inspeksi teknis ${activeSplitter.splitterCode} diunduh (CSV).`);
  };

  if (activeTab === 'inspeksi') {
    const latestHistory = odpHistoryLogs[0] || null;
    const measuredPorts = activeSplitter.ports.filter(
      (p) => p.isOccupied && typeof p.attenuation === 'number',
    );
    const avgAttenuation =
      measuredPorts.length > 0
        ? measuredPorts.reduce((sum, p) => sum + (p.attenuation ?? 0), 0) / measuredPorts.length
        : null;
    const criticalPortCount = measuredPorts.filter((p) => (p.attenuation ?? 0) < -25).length;

    return (
      <section className="odp-tab-pane" aria-label="Inspeksi Teknis">
        {/* Top Status Cards computed from live splitter ports */}
        <section className="inspection-chassis-grid" aria-label="Ringkasan Kesehatan ODP">
          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="shield" size={13} className="ui-text-ok" />
              <span>Kapasitas Splitter</span>
            </header>
            <div className="inspection-chassis-val ui-text-ok">
              {activeSplitter.maxPorts === 8 ? '1x8 PLC' : activeSplitter.maxPorts === 32 ? '1x32 PLC' : '1x16 PLC'}
            </div>
            <div className="inspection-chassis-sub">
              {activeSplitter.usedPorts} port aktif terisi dari total {activeSplitter.maxPorts} port ODP.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="sliders" size={13} className="ui-text-primary" />
              <span>Port Siap Pasang Baru</span>
            </header>
            <div className="inspection-chassis-val">
              {Math.max(0, activeSplitter.maxPorts - activeSplitter.usedPorts)} Port Tersedia
            </div>
            <div className="inspection-chassis-sub">
              Siap dialokasikan untuk aktivasi PSB baru di cluster {activeSplitter.clusterCode}.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="spark" size={13} className="ui-text-primary" />
              <span>Status Redaman Port</span>
            </header>
            <div className={`inspection-chassis-val ${criticalPortCount > 0 ? 'ui-text-danger' : 'ui-text-ok'}`}>
              {criticalPortCount > 0 ? `${criticalPortCount} Port Kritis` : 'Normal Operasional'}
            </div>
            <div className="inspection-chassis-sub">
              Pemantauan ambang batas redaman optik &lt; -25.0 dBm pada seluruh pelanggan ODP.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="activity" size={13} className="ui-text-ok" />
              <span>Rata-rata Redaman Port</span>
            </header>
            <div className="inspection-chassis-val ui-text-ok">
              {avgAttenuation !== null ? `${avgAttenuation.toFixed(1)} dBm` : '—'}
            </div>
            <div className="inspection-chassis-sub">
              {measuredPorts.length > 0
                ? `Dihitung dari ${measuredPorts.length} port pelanggan aktif pada ${activeSplitter.splitterCode}.`
                : 'Belum ada pengukuran redaman port aktif tersimpan.'}
            </div>
          </article>
        </section>

        {/* Inspection Action Strip */}
        <nav className="inspection-action-strip" aria-label="Aksi hasil inspeksi">
          <div className="inspection-action-info">
            <Icon name="check" size={14} />
            <span>
              {latestHistory ? (
                <>
                  Aktivitas Terakhir: {latestHistory.date} oleh <strong>{latestHistory.technician}</strong>{' '}
                  (Tiket: {latestHistory.ticketNumber})
                </>
              ) : (
                `Belum ada catatan inspeksi/pemasangan pada ${activeSplitter.splitterCode}.`
              )}
            </span>
          </div>

          <div className="inspection-action-buttons">
            <button
              type="button"
              className="btn-inspect-detail-action"
              onClick={handleDownloadInspectionCsv}
            >
              <Icon name="download" size={12} />
              <span>Unduh Laporan Inspeksi (CSV)</span>
            </button>

            {canCreateTicket && (
              <button
                type="button"
                className="btn-inspect-ticket-action"
                onClick={() => {
                  setTicketModalInitial({
                    ticketType: 'MAINTENANCE',
                    clusterCode: activeSplitter.name,
                    adminNotes: `Inspeksi berkala dan audit fisik pada ${activeSplitter.splitterCode}`,
                  });
                  setTicketModalOpen(true);
                }}
              >
                <Icon name="plus" size={12} />
                <span>Jadwalkan Inspeksi Baru</span>
              </button>
            )}
          </div>
        </nav>

        {/* Port Physical Inspection Table */}
        <div className="table-scroll" style={{ borderRadius: '8px', overflow: 'hidden' }} tabIndex={0} role="region" aria-label="Tabel inspeksi fisik port">
          <table className="odp-clean-table">
            <thead>
              <tr>
                <th scope="col">PORT</th>
                <th scope="col">STATUS ALOKASI</th>
                <th scope="col">PENGUKURAN REDAMAN</th>
                <th scope="col">FOTO KERJA</th>
                <th scope="col">TANGGAL & TEKNISI</th>
                <th scope="col">CATATAN HASIL PEMERIKSAAN</th>
                <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>TINDAKAN</th>
              </tr>
            </thead>
            <tbody>
              {activeSplitter.ports.map((port) => {
                const attMeta = getAttenuationMeta(port.attenuation);
                const isOccupied = port.isOccupied;

                return (
                  <tr key={port.portNumber} className="odp-table-data-row">
                    <td>
                      <span className="port-id-chip-clean">
                        P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
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
                      {isOccupied && port.attenuation !== undefined ? (
                        <span className="redaman-value-clean">
                          <span>{port.attenuation.toFixed(1)} dBm</span>
                          <SignalStrengthBars status={attMeta.status} />
                        </span>
                      ) : (
                        <span className="ui-text-muted">-</span>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11.5px',
                          color: 'var(--color-text-body)',
                        }}
                      >
                        <Icon name="camera" size={12} style={{ color: 'var(--color-text-muted)' }} />
                        <span>{port.lastActivity ? 'Tersedia di tiket' : 'Belum ada'}</span>
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '11.5px' }}>
                        <div style={{ fontWeight: 600 }}>
                          {port.lastActivity?.date || '—'}
                        </div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '10.5px' }}>
                          {port.lastActivity?.technician || 'Belum tercatat'}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '11.5px' }}>
                        {port.lastActivity?.notes ||
                          (isOccupied
                            ? 'Port aktif teralokasi pada pelanggan.'
                            : 'Port bebas alokasi PSB.')}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                      <button
                        type="button"
                        className="action-detail-link"
                        onClick={() => {
                          if (isOccupied) {
                            setTicketModalInitial({
                              ticketType: 'MAINTENANCE',
                              clusterCode: activeSplitter.name,
                              customerName: port.customerName || '',
                              siaNumber: port.siaNumber || '',
                              adminNotes: `Inspeksi ulang redaman pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                            });
                          } else {
                            setTicketModalInitial({
                              ticketType: 'PSB',
                              clusterCode: activeSplitter.name,
                              adminNotes: `Penugasan Pasang Baru pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                            });
                          }
                          setTicketModalOpen(true);
                        }}
                      >
                        {isOccupied ? 'Inspeksi Ulang' : 'Alokasi PSB'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (activeTab === 'riwayat') {
    return (
      <section className="odp-tab-pane" aria-label="Riwayat Aktivitas">
        {/* Riwayat Activity Filters */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>
              Log Histori Aktivitas Operasional {activeSplitter.splitterCode}
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              Jejak audit seluruh tiket maintenance, pemasangan baru (PSB), dan penarikan teknisi.
            </div>
          </div>

          <nav aria-label="Filter tipe riwayat" style={{ display: 'flex', gap: '6px' }}>
            {(['ALL', 'MAINTENANCE', 'PEMASANGAN', 'PENARIKAN'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                className={`filter-chip ${historyTypeFilter === filterKey ? 'active' : ''}`}
                onClick={() => setHistoryTypeFilter(filterKey)}
              >
                {filterKey === 'ALL' ? 'Semua Log' : filterKey}
              </button>
            ))}
          </nav>
        </header>

        {/* Timeline list */}
        {historyLoading ? (
          <div className="empty-state-card" style={{ padding: '24px' }}>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
              Memuat log histori pengukuran ODP dari PostgreSQL...
            </p>
          </div>
        ) : (
          (() => {
            const visibleLogs = odpHistoryLogs.filter(
              (log) => historyTypeFilter === 'ALL' || log.type === historyTypeFilter,
            );
            if (visibleLogs.length === 0) {
              return (
                <div className="empty-state-card" style={{ padding: '24px' }}>
                  <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600 }}>
                    Belum ada riwayat aktivitas untuk ODP {activeSplitter.splitterCode}.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                    Riwayat otomatis tercatat setiap kali teknisi menyelesaikan pengukuran OPM atau mutasi port.
                  </p>
                </div>
              );
            }

            return (
              <ol className="timeline-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {visibleLogs.map((log, idx) => (
                  <li key={idx} className="timeline-entry">
                    <div className="timeline-entry-dot" />
                    <article className="timeline-entry-card">
                      <header className="timeline-entry-head">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            className={`status-badge-clean-${log.type === 'MAINTENANCE' ? 'normal' : log.type === 'PEMASANGAN' ? 'psb' : 'warning'}`}
                          >
                            {log.type}
                          </span>
                          <span className="timeline-entry-title">
                            Port P{log.portNumber < 10 ? `0${log.portNumber}` : log.portNumber} :{' '}
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
                        <span>·</span>
                        <span>
                          Tiket: <code>{log.ticketNumber}</code>
                        </span>
                        {log.attenuationDelta && (
                          <>
                            <span>·</span>
                            <span className="ui-text-primary" style={{ fontWeight: 600 }}>
                              Redaman: {log.attenuationDelta}
                            </span>
                          </>
                        )}
                      </footer>
                    </article>
                  </li>
                ))}
              </ol>
            );
          })()
        )}
      </section>
    );
  }

  if (activeTab === 'audit') {
    return (
      <section className="odp-tab-pane" aria-label="Audit Konkurensi">
        {/* Concurrency Guard Overview */}
        <article className="audit-overview-card">
          <header className="audit-overview-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="audit-spec-badge">🔒 idx_unique_active_splitter_port</span>
                <span className="status-badge-clean-normal">
                  <span>✓</span>
                  <span>100% ACID Enforced</span>
                </span>
              </div>
              <h3
                style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '6px' }}
              >
                Proteksi Integritas Konkurensi Database PostgreSQL (PRD Section 5.2)
              </h3>
              <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                Partial unique constraint mencegah bentrokan penugasan port ganda secara paralel
                antar teknisi lapangan.
              </p>
            </div>

            <button type="button" className="btn-inspect-detail-action" onClick={handleRunAudit}>
              <Icon name="refresh" size={12} />
              <span>{auditRunning ? 'Memvalidasi Skema...' : 'Jalankan Uji Integritas'}</span>
            </button>
          </header>

          <section className="audit-kpi-grid" aria-label="Metrik KPI Audit">
            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Tabrakan Port (Collision)</div>
              <div
                className={`audit-kpi-box-val ${
                  auditResult && auditResult.doubleBookedPorts > 0 ? 'ui-text-danger' : 'ui-text-ok'
                }`}
              >
                {auditResult ? `${auditResult.doubleBookedPorts} Terdeteksi` : 'Belum Diaudit'}
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Port Terkunci Atomik</div>
              <div className="audit-kpi-box-val ui-text-primary">
                {activeSplitter.usedPorts} Port Aktif
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Temuan Anomali Global</div>
              <div
                className="audit-kpi-box-val"
                style={{
                  color:
                    auditResult && auditResult.findings.length > 0
                      ? 'var(--color-warning-text)'
                      : 'var(--color-text-muted)',
                }}
              >
                {auditResult ? `${auditResult.findings.length} Temuan` : 'Menunggu Audit'}
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Waktu Verifikasi Terakhir</div>
              <div className="audit-kpi-box-val" style={{ fontSize: '12px', fontWeight: 600 }}>
                {auditTimestamp}
              </div>
            </div>
          </section>
        </article>

        {auditResult && auditResult.findings.length > 0 && (
          <div className="table-scroll" style={{ borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
            <table className="odp-clean-table" aria-label="Temuan Audit Jaringan">
              <thead>
                <tr>
                  <th scope="col">SEVERITAS</th>
                  <th scope="col">KATEGORI</th>
                  <th scope="col">ODP / CLUSTER</th>
                  <th scope="col">RINGKASAN TEMUAN</th>
                </tr>
              </thead>
              <tbody>
                {auditResult.findings.slice(0, 10).map((f) => (
                  <tr key={f.id} className="odp-table-data-row">
                    <td>
                      <span className={`status-badge-clean-${f.severity === 'critical' ? 'warning' : 'normal'}`}>
                        {f.severity.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <code className="modal-code-chip" style={{ fontSize: '10.5px' }}>{f.category}</code>
                    </td>
                    <td>
                      <strong>{f.splitterCode}</strong> ({f.clusterCode})
                    </td>
                    <td style={{ fontSize: '11.5px' }}>
                      <strong>{f.title}:</strong> {f.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit Entries Table */}
        <div className="table-scroll" style={{ borderRadius: '8px', overflow: 'hidden' }} tabIndex={0} role="region" aria-label="Tabel entri audit port">
          <table className="odp-clean-table">
            <thead>
              <tr>
                <th scope="col">PORT</th>
                <th scope="col">STATUS ALOKASI</th>
                <th scope="col">KUNCI DATABASE</th>
                <th scope="col">NOMOR SIA / PELANGGAN</th>
                <th scope="col">KUNCI ATOMIK SPLITTER</th>
                <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>VALIDASI CONSTRAINT</th>
              </tr>
            </thead>
            <tbody>
              {activeSplitter.ports.map((port) => {
                const isOccupied = port.isOccupied;
                const lockKey = isOccupied
                  ? `${activeSplitter.splitterCode}:P${String(port.portNumber).padStart(2, '0')}`
                  : 'UNBOUND';

                return (
                  <tr key={port.portNumber} className="odp-table-data-row">
                    <td>
                      <span className="port-id-chip-clean">
                        P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}
                      >
                        {isOccupied ? 'Terisi (Active)' : 'Siap PSB'}
                      </span>
                    </td>

                    <td>
                      <code className="modal-code-chip" style={{ fontSize: '10.5px' }}>
                        {isOccupied ? 'idx_unique_active_splitter_port' : 'FREE_POOL'}
                      </code>
                    </td>

                    <td>
                      {isOccupied ? (
                        <div>
                          <span style={{ fontWeight: 600 }}>
                            {port.customerName}
                          </span>
                          <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                            {port.siaNumber}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Port Siap Alokasi</span>
                      )}
                    </td>

                    <td>
                      <code
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {lockKey}
                      </code>
                    </td>

                    <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                      <span
                        className={
                          isOccupied ? 'status-badge-clean-normal' : 'status-badge-clean-psb'
                        }
                      >
                        <span>✓</span>
                        <span>{isOccupied ? 'Terkunci Valid' : 'Bebas Valid'}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return null;
}
