import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type {
  ClusterListItem,
  SplitterPortState,
  CustomerListItem,
  CreateTicketInput,
} from '@repo/shared';
import { SignalStrengthBars } from '@/features/customers';
import type { AttenuationMeta } from '../hooks/use-network';

export interface SplitterPortGridProps {
  activeSplitter: ClusterListItem;
  activeSplitterFilteredPorts: SplitterPortState[];
  portFilter: 'ALL' | 'OCCUPIED' | 'AVAILABLE';
  setPortFilter: (filter: 'ALL' | 'OCCUPIED' | 'AVAILABLE') => void;
  expandedPortNum: number | null;
  setExpandedPortNum: React.Dispatch<React.SetStateAction<number | null>>;
  getAttenuationMeta: (att: number | undefined) => AttenuationMeta;
  handlePortClick: (c: ClusterListItem, port: SplitterPortState) => void;
  setSelectedCustomerForModal: (cust: CustomerListItem | null) => void;
  setTicketModalInitial: (initial: Partial<CreateTicketInput>) => void;
  setTicketModalOpen: (open: boolean) => void;
  canCreateTicket: boolean;
}

export function SplitterPortGrid({
  activeSplitter,
  activeSplitterFilteredPorts,
  portFilter,
  setPortFilter,
  expandedPortNum,
  setExpandedPortNum,
  getAttenuationMeta,
  handlePortClick,
  setSelectedCustomerForModal,
  setTicketModalInitial,
  setTicketModalOpen,
  canCreateTicket,
}: SplitterPortGridProps) {
  return (
    <section className="odp-table-wrapper" aria-label="Daftar Port Splitter">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderBottom: '1px solid #f1f5f9',
          background: '#fbfcfd',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginRight: '4px' }}>
          Filter Port:
        </span>
        <nav aria-label="Filter status port" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setPortFilter('ALL')}
            style={{
              padding: '4px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: portFilter === 'ALL' ? '#0e5b92' : '#dce7f0',
              background: portFilter === 'ALL' ? '#eef5fa' : '#ffffff',
              color: portFilter === 'ALL' ? '#0e5b92' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Semua Port ({activeSplitter.ports.length})
          </button>
          <button
            type="button"
            onClick={() => setPortFilter('OCCUPIED')}
            style={{
              padding: '4px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: portFilter === 'OCCUPIED' ? '#0e5b92' : '#dce7f0',
              background: portFilter === 'OCCUPIED' ? '#eef5fa' : '#ffffff',
              color: portFilter === 'OCCUPIED' ? '#0e5b92' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Terpakai ({activeSplitter.ports.filter((p) => p.isOccupied).length})
          </button>
          <button
            type="button"
            onClick={() => setPortFilter('AVAILABLE')}
            style={{
              padding: '4px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: portFilter === 'AVAILABLE' ? '#0e5b92' : '#dce7f0',
              background: portFilter === 'AVAILABLE' ? '#eef5fa' : '#ffffff',
              color: portFilter === 'AVAILABLE' ? '#0e5b92' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Tersedia ({activeSplitter.ports.filter((p) => !p.isOccupied).length})
          </button>
        </nav>
      </header>
      <div tabIndex={0} role="region" aria-label="Tabel port splitter" style={{ overflowX: 'auto' }}>
        <table className="odp-clean-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '36px' }}><span className="sr-only">Navigasi</span></th>
              <th scope="col">PORT</th>
              <th scope="col">ALOKASI</th>
              <th scope="col">PELANGGAN / SIA</th>
              <th scope="col">REDAMAN (dBm)</th>
              <th scope="col">STATUS</th>
              <th scope="col">AKTIVITAS TERAKHIR</th>
              <th scope="col" style={{ textAlign: 'right', paddingRight: '18px' }}>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {activeSplitterFilteredPorts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                  Tidak ada port yang cocok dengan filter status yang dipilih.
                </td>
              </tr>
            ) : (
              activeSplitterFilteredPorts.map((port) => {
                const isExpanded = expandedPortNum === port.portNumber;
                const isOccupied = port.isOccupied;
                const attMeta = getAttenuationMeta(port.attenuation);

                return (
                  <React.Fragment key={port.portNumber}>
                    <tr
                      className={`odp-table-data-row ${isExpanded ? 'is-row-selected' : ''}`}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      aria-label={`Port P${port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}, ${isOccupied ? port.customerName || 'Terisi' : 'Siap PSB'}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedPortNum((prev) =>
                            prev === port.portNumber ? null : port.portNumber,
                          );
                        }
                      }}
                      onClick={() =>
                        setExpandedPortNum((prev) =>
                          prev === port.portNumber ? null : port.portNumber,
                        )
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Chevron Expand */}
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        <span>{isExpanded ? '⌄' : '›'}</span>
                      </td>

                      {/* Port */}
                      <td>
                        <span className="port-id-chip-clean">
                          P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                        </span>
                      </td>

                      {/* Alokasi */}
                      <td>
                        <span
                          className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}
                        >
                          {isOccupied ? 'Terisi' : 'Siap PSB'}
                        </span>
                      </td>

                      {/* Pelanggan / SIA */}
                      <td>
                        {isOccupied ? (
                          <div>
                            <div className="customer-name-bold">
                              {port.customerName || 'Pelanggan'}
                            </div>
                            <div className="customer-sia-code">{port.siaNumber || '-'}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>

                      {/* Redaman (dBm) */}
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

                      {/* Status */}
                      <td>
                        {isOccupied ? (
                          <span className={`status-badge-clean-${attMeta.status}`}>
                            <span>✓</span>
                            <span>
                              {attMeta.status === 'normal'
                                ? 'Normal'
                                : attMeta.status === 'warning'
                                  ? 'Waspada'
                                  : 'Kritis'}
                            </span>
                          </span>
                        ) : (
                          <span className="status-badge-clean-psb">
                            <span>✓</span>
                            <span>Siap PSB</span>
                          </span>
                        )}
                      </td>

                      {/* Aktivitas Terakhir */}
                      <td>
                        {port.lastActivity ? (
                          <div className="activity-cell-clean">
                            <span className="activity-title-clean">
                              <Icon name="network" size={12} style={{ color: '#64748b' }} />
                              <span>
                                {port.lastActivity.type === 'MAINTENANCE'
                                  ? 'Maintenance'
                                  : port.lastActivity.type === 'PEMASANGAN'
                                    ? 'Pemasangan'
                                    : 'Penarikan'}
                              </span>
                            </span>
                            <span className="activity-sub-clean">{port.lastActivity.technician}</span>
                            <span className="activity-sub-clean">{port.lastActivity.date}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td
                        style={{ textAlign: 'right', paddingRight: '18px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            className="action-detail-link"
                            onClick={() =>
                              setExpandedPortNum((prev) =>
                                prev === port.portNumber ? null : port.portNumber,
                              )
                            }
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            className="odp-more-menu-btn"
                            style={{ padding: '2px 6px' }}
                            title="Opsi Port"
                            aria-label={`Opsi Port P${port.portNumber}`}
                            onClick={() => handlePortClick(activeSplitter, port)}
                          >
                            ⋮
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Detail Inspeksi Row */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={8} style={{ padding: '8px 16px 14px 16px' }}>
                          <article className="inline-inspect-box-reference">
                            <header className="inline-inspect-box-title">
                              Detail Inspeksi Port P
                              {port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                            </header>

                            <div className="inline-inspect-ref-grid">
                              <div className="inline-inspect-col">
                                <span className="inline-inspect-col-label">Hasil Inspeksi</span>
                                <span
                                  className="inline-inspect-col-val"
                                  style={{ color: isOccupied ? '#16a34a' : '#0284c7' }}
                                >
                                  {isOccupied ? 'Normal' : 'Port Siap Alokasi PSB'}
                                </span>
                              </div>

                              <div className="inline-inspect-col">
                                <span className="inline-inspect-col-label">Foto</span>
                                <span
                                  className="inline-inspect-col-val"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <Icon name="camera" size={13} style={{ color: '#64748b' }} />
                                  <span>{isOccupied ? '2 foto' : 'Tidak ada foto'}</span>
                                </span>
                              </div>

                              <div className="inline-inspect-col">
                                <span className="inline-inspect-col-label">Catatan</span>
                                <span
                                  className="inline-inspect-col-val"
                                  style={{ fontWeight: 400, color: '#334155' }}
                                >
                                  {port.lastActivity?.notes ||
                                    (isOccupied
                                      ? 'Tidak ada kendala, sinyal stabil.'
                                      : 'Port bebas untuk aktivasi pelanggan baru.')}
                                </span>
                              </div>

                              <div
                                className="inline-inspect-col"
                                style={{ alignItems: 'flex-end', gap: '8px' }}
                              >
                                <nav
                                  aria-label="Aksi inspeksi port"
                                  style={{
                                    display: 'flex',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end',
                                  }}
                                >
                                  {isOccupied && port.customerName ? (
                                    <button
                                      type="button"
                                      className="btn-inspect-detail-action"
                                      onClick={() => {
                                        setSelectedCustomerForModal({
                                          id: port.siaNumber || `CUST-${port.portNumber}`,
                                          fullName: port.customerName || 'Pelanggan',
                                          siaNumber: port.siaNumber || 'SIA-2024-BT01',
                                          address: `Area ${activeSplitter.name}`,
                                          cluster: activeSplitter.name,
                                          clusterCode: activeSplitter.clusterCode,
                                          splitterCode: activeSplitter.splitterCode,
                                          portNumber: port.portNumber,
                                          currentAttenuation: port.attenuation ?? -18.8,
                                          status: 'ACTIVE',
                                          updatedAt: new Date().toISOString(),
                                        });
                                      }}
                                    >
                                      <Icon name="link" size={12} />
                                      <span>Lihat Detail</span>
                                    </button>
                                  ) : null}

                                  {canCreateTicket && (
                                    <button
                                      type="button"
                                      className="btn-inspect-ticket-action"
                                      onClick={() => {
                                        setTicketModalInitial({
                                          ticketType: isOccupied ? 'MAINTENANCE' : 'PSB',
                                          clusterCode: activeSplitter.name,
                                          customerName: port.customerName || '',
                                          siaNumber: port.siaNumber || '',
                                          adminNotes: isOccupied
                                            ? `Maintenance redaman pada ${activeSplitter.splitterCode} Port ${port.portNumber} (${port.attenuation || 'N/A'} dBm)`
                                            : `Penugasan Pasang Baru pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                                        });
                                        setTicketModalOpen(true);
                                      }}
                                    >
                                      <Icon name="plus" size={12} />
                                      <span>Buat Tiket</span>
                                    </button>
                                  )}
                                </nav>
                              </div>
                            </div>
                          </article>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
