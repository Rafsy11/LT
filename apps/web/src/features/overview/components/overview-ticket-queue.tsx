import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { OverviewTableSkeletonRows } from '@/components/ui/PageSkeleton';
import { SearchInput } from '@/components/ui/search-input';
import type { DbTicket } from '@repo/shared';

const OVERVIEW_SKELETON_ROW_COUNT = 4;

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
  tickets: _tickets,
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
        <header className="panel-heading table-panel-header">
          <div className="table-header-left">
            <div className="table-title-row">
              <h2>Tiket &amp; Work Order</h2>
              <span className="table-count-badge">{filteredTickets.length}</span>
            </div>
            <p>Kelola dan pantau progres pekerjaan tim Anda</p>
          </div>

          <div className="table-header-controls">
            {/* Quick Status Filter Tabs */}
            <nav className="status-tabs" role="tablist" aria-label="Filter status tiket">
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
            </nav>

            {/* Search Box */}
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Cari tiket atau pelanggan..."
              ariaLabel="Cari tiket atau pelanggan"
              className="table-search-box"
            />

            {/* Filter Button */}
            <button className="button-filter" type="button" aria-label="Buka filter lanjutan">
              <Icon name="filter" size={14} />
              <span>Filter &gt;</span>
            </button>
          </div>
        </header>

        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Antrean Tiket">
          <table className="lintasarta-table">
            <thead>
              <tr>
                <th scope="col">NO. TIKET</th>
                <th scope="col">PELANGGAN</th>
                <th scope="col">TIPE PEKERJAAN</th>
                <th scope="col">CLUSTER</th>
                <th scope="col">TEKNISI</th>
                <th scope="col">STATUS</th>
                <th scope="col">PRIORITAS</th>
                <th scope="col">REDAMAN</th>
                <th scope="col" aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {loading && filteredTickets.length === 0 ? (
                <OverviewTableSkeletonRows count={OVERVIEW_SKELETON_ROW_COUNT} />
              ) : filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                    Tidak ada tiket yang sesuai dengan filter atau kata kunci pencarian.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((r) => {
                  const priorityMap: Record<string, string> = {
                    High: 'Tinggi',
                    Normal: 'Normal',
                    Low: 'Rendah',
                    Critical: 'Kritis',
                    high: 'Tinggi',
                    normal: 'Normal',
                    low: 'Rendah',
                    critical: 'Kritis',
                  };
                  const priorityVal = r.priority || 'Normal';
                  const localizedPriority = priorityMap[priorityVal] || priorityVal;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => onSelectTicket(r)}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectTicket(r);
                        }
                      }}
                      aria-label={`Lihat rincian tiket ${r.ticketNumber}`}
                    >
                      <td>
                        <b className="tkt-code">{r.ticketNumber}</b>
                      </td>
                      <td>
                        <div className="cell-multiline">
                          <b>{r.customerName || 'Pelanggan'}</b>
                          <span>SIA {r.siaNumber || '-'}</span>
                        </div>
                      </td>
                      <td>{r.ticketType}</td>
                      <td>
                        <span className="cluster-tag">{r.cluster || '-'}</span>
                      </td>
                      <td>
                        <div className="tech-cell">
                          <DefaultAvatar name={r.assignedTech || 'Belum ditugaskan'} size={24} />
                          <span>{r.assignedTech || 'Belum ditugaskan'}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            r.status === 'Selesai'
                              ? 'done'
                              : r.status === 'Dalam proses' || r.status === 'Menunggu verifikasi'
                                ? 'progress'
                                : 'waiting'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`priority-pill ${
                            priorityVal.toLowerCase() === 'high' || priorityVal.toLowerCase() === 'critical'
                              ? 'high'
                              : 'normal'
                          }`}
                        >
                          {localizedPriority}
                        </span>
                      </td>
                      <td>
                        <div className="dbm-cell">
                          <b>{typeof r.currentAttenuation === 'number' ? `${r.currentAttenuation} dBm` : '-'}</b>
                          <span className="dbm-status ok">Normal</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="action-dots"
                          aria-label={`Aksi untuk tiket ${r.ticketNumber}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTicket(r);
                          }}
                          type="button"
                        >
                          •••
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
