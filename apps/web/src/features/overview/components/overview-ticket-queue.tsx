import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { DbTicket } from '@repo/shared';

export interface OverviewTicketQueueProps {
  tickets: DbTicket[];
  filteredTickets: DbTicket[];
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  query: string;
  setQuery: (query: string) => void;
  loading: boolean;
  onSelectTicket: (ticket: DbTicket) => void;
}

export function OverviewTicketQueue({
  tickets,
  filteredTickets,
  statusFilter,
  setStatusFilter,
  query,
  setQuery,
  loading,
  onSelectTicket,
}: OverviewTicketQueueProps) {
  return (
    <section className="panel overview-table-panel" aria-label="Daftar Tiket dan Work Order">
      <div className="panel-inner">
        <div className="panel-heading table-panel-header">
          <div className="table-header-left">
            <div className="table-title-row">
              <h2>Tiket & Work Order</h2>
              <span className="table-count-badge">32</span>
            </div>
            <p>Kelola dan pantau progres pekerjaan tim Anda</p>
          </div>

          <div className="table-header-controls">
            {/* Quick Status Filter Tabs */}
            <div className="status-tabs" role="tablist" aria-label="Filter status tiket">
              {['Semua', 'Menunggu', 'Dalam proses', 'Selesai'].map((st) => (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === st}
                  className={`status-tab-btn ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="table-search-box">
              <Icon name="search" size={14} />
              <input
                placeholder="Cari tiket atau pelanggan..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Cari tiket atau pelanggan"
              />
            </div>

            {/* Filter Button */}
            <button className="button-filter" type="button" aria-label="Buka filter lanjutan">
              <Icon name="filter" size={14} />
              <span>Filter &gt;</span>
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="lintasarta-table">
            <thead>
              <tr>
                <th>NO. TIKET</th>
                <th>PELANGGAN</th>
                <th>TIPE PEKERJAAN</th>
                <th>CLUSTER</th>
                <th>TEKNISI</th>
                <th>STATUS</th>
                <th>PRIORITAS</th>
                <th>REDAMAN</th>
                <th aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((r) => {
                const priorityMap: Record<string, string> = {
                  High: 'Tinggi',
                  Normal: 'Normal',
                  Low: 'Rendah',
                  Critical: 'Kritis',
                  high: 'Tinggi',
                  normal: 'Normal',
                  low: 'Rendah',
                  critical: 'Kritis',
                  Tinggi: 'Tinggi',
                  Rendah: 'Rendah',
                  Kritis: 'Kritis',
                };
                const priorityLabel =
                  (r.priority && priorityMap[r.priority]) || r.priority || 'Normal';

                return (
                  <tr key={r.id || r.ticketNumber} onClick={() => onSelectTicket(r)}>
                    <td className="ticket-id-link">{r.ticketNumber}</td>
                    <td>
                      <b className="customer-name">{r.customerName}</b>
                      <small className="sia-code">{r.siaNumber}</small>
                    </td>
                    <td>
                      <span
                        className={`type-chip ${
                          r.ticketType === 'Pasang baru'
                            ? 'chip-blue'
                            : r.ticketType === 'Perbaikan'
                              ? 'chip-amber'
                              : r.ticketType === 'Maintenance'
                                ? 'chip-purple'
                                : 'chip-blue'
                        }`}
                      >
                        {r.ticketType}
                      </span>
                    </td>
                    <td className="cluster-text">{r.cluster}</td>
                    <td>
                      <div
                        className="tech-cell"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <DefaultAvatar size={24} name={r.assignedTech} />
                        <span className="tech-name">{r.assignedTech}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-chip-pill ${
                          r.status === 'Selesai'
                            ? 'green'
                            : r.status === 'Menunggu'
                              ? 'neutral'
                              : 'blue'
                        }`}
                      >
                        <i className="status-chip-dot" />
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                        {priorityLabel}
                      </span>
                    </td>
                    <td className="attenuation-cell">
                      <span className="muted-dash">-</span>
                    </td>
                    <td className="action-col-dots">
                      <span className="more-dots">⋯</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredTickets.length && !loading && (
            <div className="table-empty-state">
              <Icon name="ticket" size={24} />
              <p>Tidak ada tiket yang cocok dengan kriteria filter.</p>
            </div>
          )}
        </div>

        <div className="table-footer-bar">
          <span>
            Menampilkan {filteredTickets.length} dari {tickets.length} tiket
          </span>
          <span>Master Data Terverifikasi · FiberOps On-Premise</span>
        </div>
      </div>
    </section>
  );
}
