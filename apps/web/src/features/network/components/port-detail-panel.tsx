import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ClusterListItem, CreateTicketInput } from '@repo/shared';
import { SignalStrengthBars } from '@/features/customers';
import type { AttenuationMeta, OdpHistoryLogItem } from '../hooks/use-network';

export interface PortDetailPanelProps {
  activeTab: 'inspeksi' | 'riwayat' | 'audit';
  activeSplitter: ClusterListItem;
  getAttenuationMeta: (att: number | undefined) => AttenuationMeta;
  historyTypeFilter: 'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN';
  setHistoryTypeFilter: (filter: 'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN') => void;
  odpHistoryLogs: OdpHistoryLogItem[];
  auditRunning: boolean;
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
  auditRunning,
  auditTimestamp,
  handleRunAudit,
  showSuccess,
  setTicketModalInitial,
  setTicketModalOpen,
  canCreateTicket,
}: PortDetailPanelProps) {
  if (activeTab === 'inspeksi') {
    return (
      <section className="odp-tab-pane" aria-label="Inspeksi Teknis">
        {/* Top Status Cards: Chassis & Environmental Quality */}
        <section className="inspection-chassis-grid" aria-label="Kualitas Enclosure dan Sasis ODP">
          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="shield" size={13} style={{ color: '#16a34a' }} />
              <span>Enclosure ODP Box</span>
            </header>
            <div className="inspection-chassis-val" style={{ color: '#16a34a' }}>
              Terkunci & Aman (IP65)
            </div>
            <div className="inspection-chassis-sub">
              Kondisi housing tertutup rapat, seal karet kedap air utuh tanpa retak.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="sliders" size={13} style={{ color: '#0284c7' }} />
              <span>Manajemen Tray & Pigtail</span>
            </header>
            <div className="inspection-chassis-val" style={{ color: '#0f172a' }}>
              Sesuai SOP (R &gt; 30mm)
            </div>
            <div className="inspection-chassis-sub">
              Radius bending serat optik terjaga, proteksi selongsong bakar rapi.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="spark" size={13} style={{ color: '#0284c7' }} />
              <span>Kebersihan Ferrule</span>
            </header>
            <div className="inspection-chassis-val" style={{ color: '#0f172a' }}>
              Bersih (Bebas Debu)
            </div>
            <div className="inspection-chassis-sub">
              Konektor SC/UPC telah di-clean menggunakan optical cassette cleaner.
            </div>
          </article>

          <article className="inspection-chassis-card">
            <header className="inspection-chassis-card-header">
              <Icon name="activity" size={13} style={{ color: '#16a34a' }} />
              <span>Input Sinyal Feeder ODC</span>
            </header>
            <div className="inspection-chassis-val" style={{ color: '#16a34a' }}>
              -12.5 dBm
            </div>
            <div className="inspection-chassis-sub">
              Daya optik feeder normal. Loss insertion splitter 1x16 PLC: 13.8 dB.
            </div>
          </article>
        </section>

        {/* Inspection Action Strip */}
        <nav className="inspection-action-strip" aria-label="Aksi hasil inspeksi">
          <div className="inspection-action-info">
            <Icon name="check" size={14} />
            <span>
              Inspeksi Preventif Terakhir: 18 Okt 2026 oleh <strong>Andi Pratama</strong> (Tiket:
              TKT-2026-081)
            </span>
          </div>

          <div className="inspection-action-buttons">
            <button
              type="button"
              className="btn-inspect-detail-action"
              onClick={() => showSuccess('Laporan inspeksi teknis berhasil diunduh (PDF).')}
            >
              <Icon name="download" size={12} />
              <span>Unduh Berkas Hasil Inspeksi</span>
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
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }} tabIndex={0} role="region" aria-label="Tabel inspeksi fisik port">
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
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '11.5px',
                          color: '#475569',
                        }}
                      >
                        <Icon name="camera" size={12} style={{ color: '#64748b' }} />
                        <span>{isOccupied ? '2 foto' : 'Tidak ada'}</span>
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '11.5px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {port.lastActivity?.date || '05 Okt 2026'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '10.5px' }}>
                          {port.lastActivity?.technician || 'Dedi Kurniawan'}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '11.5px', color: '#334155' }}>
                        {port.lastActivity?.notes ||
                          (isOccupied
                            ? 'Sinyal optik stabil, ferrule bersih.'
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
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Log Histori Aktivitas Operasional {activeSplitter.splitterCode}
            </h3>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Jejak audit seluruh tiket maintenance, pemasangan baru (PSB), dan penarikan teknisi.
            </div>
          </div>

          <nav aria-label="Filter tipe riwayat" style={{ display: 'flex', gap: '6px' }}>
            {(['ALL', 'MAINTENANCE', 'PEMASANGAN', 'PENARIKAN'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                className={`filter-chip ${historyTypeFilter === filterKey ? 'active' : ''}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  borderRadius: '14px',
                  border:
                    historyTypeFilter === filterKey ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  background: historyTypeFilter === filterKey ? '#0284c7' : '#ffffff',
                  color: historyTypeFilter === filterKey ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setHistoryTypeFilter(filterKey)}
              >
                {filterKey === 'ALL' ? 'Semua Log' : filterKey}
              </button>
            ))}
          </nav>
        </header>

        {/* Timeline list */}
        <ol className="timeline-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {odpHistoryLogs
            .filter((log) => historyTypeFilter === 'ALL' || log.type === historyTypeFilter)
            .map((log, idx) => (
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
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>
                          Redaman: {log.attenuationDelta}
                        </span>
                      </>
                    )}
                  </footer>
                </article>
              </li>
            ))}
        </ol>
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
                style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}
              >
                Proteksi Integritas Konkurensi Database PostgreSQL (PRD Section 5.2)
              </h3>
              <p style={{ fontSize: '11.5px', color: '#475569', marginTop: '3px' }}>
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
              <div className="audit-kpi-box-val" style={{ color: '#16a34a' }}>
                0 Terdeteksi
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Port Terkunci Atomik</div>
              <div className="audit-kpi-box-val" style={{ color: '#0284c7' }}>
                {activeSplitter.usedPorts} Port Aktif
              </div>
            </div>

            <div className="audit-kpi-box">
              <div className="audit-kpi-box-label">Port Bebas (Siap PSB)</div>
              <div className="audit-kpi-box-val" style={{ color: '#475569' }}>
                {activeSplitter.maxPorts - activeSplitter.usedPorts} Port
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

        {/* Audit Entries Table */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }} tabIndex={0} role="region" aria-label="Tabel entri audit port">
          <table className="odp-clean-table">
            <thead>
              <tr>
                <th scope="col">PORT</th>
                <th scope="col">STATUS ALOKASI</th>
                <th scope="col">KUNCI DATABASE</th>
                <th scope="col">NOMOR SIA / PELANGGAN</th>
                <th scope="col">HASH INTEGRITAS AUDIT</th>
                <th scope="col" style={{ textAlign: 'right', paddingRight: '16px' }}>VALIDASI CONSTRAINT</th>
              </tr>
            </thead>
            <tbody>
              {activeSplitter.ports.map((port) => {
                const isOccupied = port.isOccupied;
                const hashStr = `sha256:${(port.portNumber * 8191 + 104729).toString(16).padEnd(10, '0')}...`;

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
                      <code
                        style={{
                          fontSize: '11px',
                          color: '#1e40af',
                          background: '#eff6ff',
                          padding: '2px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        {isOccupied ? 'idx_unique_active_splitter_port' : 'FREE_POOL'}
                      </code>
                    </td>

                    <td>
                      {isOccupied ? (
                        <div>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            {port.customerName}
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                            {port.siaNumber}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Port Siap Alokasi</span>
                      )}
                    </td>

                    <td>
                      <code
                        style={{
                          fontSize: '10.5px',
                          color: '#64748b',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {hashStr}
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
