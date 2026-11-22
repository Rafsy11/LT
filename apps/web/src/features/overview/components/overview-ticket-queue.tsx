import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { OverviewTableSkeletonRows } from '@/components/ui/PageSkeleton';
import { SearchInput } from '@/components/ui/search-input';
import { classifyDbm, type DbTicket } from '@repo/shared';

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
  const hasActiveFilter = statusFilter !== 'Semua' || query.trim() !== '';
  const handleResetFilter = () => {
    setStatusFilter('Semua');
    setQuery('');
  };

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
              {['Semua', 'Menunggu', 'Dalam proses', 'Menunggu verifikasi', 'Selesai'].map((st) => (
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

            {/* Search Box & Filter Navigation Link Row */}
            <div className="table-search-filter-row">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Cari tiket atau pelanggan..."
                ariaLabel="Cari tiket atau pelanggan"
                className="table-search-box"
              />

              {/* Direct Navigation to Full Ticket Filter Workspace */}
              <Link
                href="/tickets"
                className="button-filter"
                aria-label="Buka halaman kelola dan filter tiket lengkap"
              >
                <Icon name="filter" size={14} />
                <span>Kelola Tiket &gt;</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Desktop Data Table */}
        <div className="table-scroll desktop-table-scroll" tabIndex={0} role="region" aria-label="Tabel Antrean Tiket">
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
                  <td colSpan={9} style={{ padding: '16px' }}>
                    <EmptyState
                      icon="ticket"
                      title={hasActiveFilter ? 'Tidak ada tiket yang cocok' : 'Belum ada antrean tiket'}
                      description={
                        hasActiveFilter
                          ? 'Tidak ditemukan tiket dengan status atau kata kunci pencarian tersebut. Reset filter untuk melihat seluruh daftar.'
                          : 'Saat ini belum ada tiket work order yang terdaftar pada sistem.'
                      }
                      actionLabel={hasActiveFilter ? 'Reset Filter' : undefined}
                      actionIcon="refresh"
                      onAction={hasActiveFilter ? handleResetFilter : undefined}
                      size="compact"
                    />
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
                          {(() => {
                            const hasValue =
                              typeof r.currentAttenuation === 'number' &&
                              r.currentAttenuation !== 0;
                            const level = hasValue ? classifyDbm(r.currentAttenuation) : 'Neutral';
                            const statusCls =
                              level === 'Critical'
                                ? 'crit'
                                : level === 'Warning'
                                  ? 'warn'
                                  : level === 'Normal'
                                    ? 'ok'
                                    : 'muted';
                            const statusLabel =
                              level === 'Critical'
                                ? 'Kritis (> 28 dB)'
                                : level === 'Warning'
                                  ? 'Batas'
                                  : level === 'Normal'
                                    ? 'Normal'
                                    : 'Belum diukur';
                            return (
                              <>
                                <b>{hasValue ? `${r.currentAttenuation} dBm` : '-'}</b>
                                <span className={`dbm-status ${statusCls}`}>{statusLabel}</span>
                              </>
                            );
                          })()}
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

        {/* Mobile Ticket Card List (App-Native Mobile NOC Feed) */}
        <div className="mobile-ticket-cards" role="feed" aria-label="Daftar Kartu Tiket Mobile">
          {loading && filteredTickets.length === 0 ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="mobile-ticket-card mobile-ticket-skeleton" aria-hidden="true">
                <div className="mobile-ticket-skel-bar" style={{ width: '45%', height: '14px', borderRadius: '4px', marginBottom: '10px' }} />
                <div className="mobile-ticket-skel-bar" style={{ width: '75%', height: '18px', borderRadius: '4px', marginBottom: '8px' }} />
                <div className="mobile-ticket-skel-bar" style={{ width: '55%', height: '12px', borderRadius: '4px', marginBottom: '14px' }} />
                <div className="mobile-ticket-skel-bar" style={{ width: '90%', height: '16px', borderRadius: '4px' }} />
              </div>
            ))
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon="ticket"
              title={hasActiveFilter ? 'Tidak ada tiket yang cocok' : 'Belum ada antrean tiket'}
              description={
                hasActiveFilter
                  ? 'Tidak ditemukan tiket dengan status atau kata kunci pencarian tersebut. Reset filter untuk melihat seluruh daftar.'
                  : 'Saat ini belum ada tiket work order yang terdaftar pada sistem.'
              }
              actionLabel={hasActiveFilter ? 'Reset Filter' : undefined}
              actionIcon="refresh"
              onAction={hasActiveFilter ? handleResetFilter : undefined}
              size="compact"
            />
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
              const isHighPriority =
                priorityVal.toLowerCase() === 'high' || priorityVal.toLowerCase() === 'critical';

              return (
                <article
                  key={r.id}
                  className="mobile-ticket-card"
                  onClick={() => onSelectTicket(r)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTicket(r);
                    }
                  }}
                  aria-label={`Rincian tiket ${r.ticketNumber} untuk ${r.customerName || 'Pelanggan'}`}
                >
                  <div className="mobile-ticket-card-header">
                    <div className="mobile-ticket-title-group">
                      <span className="mobile-ticket-id">{r.ticketNumber}</span>
                      <span className="mobile-ticket-type-chip">{r.ticketType}</span>
                    </div>
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
                  </div>

                  <div className="mobile-ticket-card-body">
                    <h3 className="mobile-ticket-customer-name">{r.customerName || 'Pelanggan'}</h3>
                    <div className="mobile-ticket-meta-row">
                      <span className="mobile-ticket-sia-badge">SIA {r.siaNumber || '-'}</span>
                      <span className="mobile-ticket-meta-dot" aria-hidden="true">·</span>
                      <span className="mobile-ticket-cluster-badge">{r.cluster || '-'}</span>
                    </div>
                  </div>

                  <div className="mobile-ticket-card-footer">
                    <div className="mobile-ticket-tech-info">
                      <DefaultAvatar name={r.assignedTech || 'Belum ditugaskan'} size={22} />
                      <span className="mobile-ticket-tech-name">
                        {r.assignedTech || 'Belum ditugaskan'}
                      </span>
                    </div>

                    <div className="mobile-ticket-badges-group">
                      {typeof r.currentAttenuation === 'number' && (
                        <span
                          className={`mobile-ticket-dbm-pill ${
                            classifyDbm(r.currentAttenuation) === 'Critical'
                              ? 'critical'
                              : classifyDbm(r.currentAttenuation) === 'Warning'
                                ? 'warning'
                                : 'normal'
                          }`}
                        >
                          <i className="status-dot" aria-hidden="true" />
                          {r.currentAttenuation} dBm
                        </span>
                      )}
                      <span className={`priority-pill ${isHighPriority ? 'high' : 'normal'}`}>
                        {localizedPriority}
                      </span>
                      <span className="mobile-ticket-chevron-icon" aria-hidden="true">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
