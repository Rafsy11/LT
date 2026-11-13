'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { TicketsSkeleton } from '@/components/ui/PageSkeleton';
import { SearchInput } from '@/components/ui/search-input';
import { useAuth } from '@/providers';
import {
  useVendorTickets,
  type VendorFilterTab,
  type VendorTicketDto,
} from '../hooks/use-vendor-tickets';
import { VendorReportModal } from './vendor-report-modal';
import '@/styles/features/vendor.css';

const FILTER_TABS: Array<{ key: VendorFilterTab; label: string }> = [
  { key: 'ALL', label: 'Semua Tugas' },
  { key: 'OPEN', label: 'Baru Ditugaskan' },
  { key: 'IN_PROGRESS', label: 'Sedang Eksekusi' },
  { key: 'PENDING_APPROVAL', label: 'Menunggu Verifikasi' },
];

function statusMeta(status: VendorTicketDto['status']): { label: string; cls: string } {
  if (status === 'PENDING_APPROVAL') return { label: 'Menunggu Verifikasi Pusat', cls: 'waiting' };
  if (status === 'IN_PROGRESS') return { label: 'Sedang Dikerjakan', cls: 'progress' };
  return { label: 'Baru Ditugaskan', cls: 'neutral' };
}

export function VendorPortalView() {
  const { user } = useAuth();
  const {
    tickets,
    filteredTickets,
    splitters,
    loading,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    startingId,
    selectedTicket,
    setSelectedTicket,
    startExecution,
    uploadOpmPhoto,
    submitVendorReport,
  } = useVendorTickets();

  if (loading && tickets.length === 0) {
    return <TicketsSkeleton />;
  }

  const openCount = tickets.filter((t) => t.status === 'OPEN').length;
  const activeCount = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const pendingApprovalCount = tickets.filter((t) => t.status === 'PENDING_APPROVAL').length;

  return (
    <main id="main-content" className="main-content vendor-page" aria-label="Portal Kerja Vendor Lapangan">
      <h1 className="sr-only">Portal Kerja Vendor Lapangan</h1>
      <div className="vendor-channel-banner">
        <div>
          <strong>Portal Multi-Kanal Vendor ({user.fullName}):</strong> Anda dapat mengerjakan dan
          melapor lewat <b>Browser (/vendor)</b>, <b>Aplikasi Mobile</b>, atau{' '}
          <b>Bot Telegram</b> dengan perintah <code>/tugas</code>, <code>/mulai NO_TIKET</code>,
          dan <code>/lapor NO_TIKET</code>.
        </div>
      </div>

      <section className="vendor-kpi-grid" aria-label="Ringkasan Antrean Vendor">
        <article className="vendor-kpi-card">
          <span className="vendor-kpi-label">Total Tugas Aktif</span>
          <strong className="vendor-kpi-value">{tickets.length}</strong>
        </article>
        <article className="vendor-kpi-card">
          <span className="vendor-kpi-label">Baru Ditugaskan CS</span>
          <strong className="vendor-kpi-value">{openCount}</strong>
        </article>
        <article className="vendor-kpi-card">
          <span className="vendor-kpi-label">Sedang Eksekusi</span>
          <strong className="vendor-kpi-value">{activeCount}</strong>
        </article>
        <article className="vendor-kpi-card">
          <span className="vendor-kpi-label">Menunggu Verifikasi</span>
          <strong className="vendor-kpi-value">{pendingApprovalCount}</strong>
        </article>
      </section>

      <div className="vendor-toolbar">
        <div className="vendor-tabs" role="tablist" aria-label="Filter Status Tugas Vendor">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === t.key}
              className={`vendor-tab-btn ${statusFilter === t.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cari tiket, pelanggan, SIA, atau alamat..."
          ariaLabel="Cari tugas vendor"
          className="vendor-search-box"
        />
      </div>

      {filteredTickets.length === 0 ? (
        <div className="empty">
          Tidak ada tugas vendor yang cocok dengan filter saat ini.
        </div>
      ) : (
        <section className="vendor-task-grid" aria-label="Daftar Penugasan Vendor">
          {filteredTickets.map((ticket) => {
            const st = statusMeta(ticket.status);
            const hasCoords =
              typeof ticket.targetLat === 'number' && typeof ticket.targetLng === 'number';

            return (
              <article key={ticket.id} className="vendor-task-card">
                <header className="vendor-task-header">
                  <div className="vendor-task-badges">
                    <span className="ticket-number-tag">{ticket.ticketNumber}</span>
                    <span className="status-pill neutral">{ticket.ticketType}</span>
                  </div>
                  <span className={`status-pill ${st.cls}`}>{st.label}</span>
                </header>

                <div className="vendor-task-customer">
                  <h2>{ticket.customer.fullName}</h2>
                  <div className="vendor-task-meta">
                    <code>{ticket.customer.siaNumber}</code>
                    <span>·</span>
                    <span>{ticket.customer.clusterName}</span>
                    {ticket.customerPhone && (
                      <>
                        <span>·</span>
                        <span>{ticket.customerPhone}</span>
                      </>
                    )}
                  </div>
                </div>

                {ticket.complaintSummary && (
                  <div className="vendor-task-complaint">
                    <strong>Aduan / Permintaan:</strong> {ticket.complaintSummary}
                  </div>
                )}

                <div className="vendor-task-location">
                  <div>
                    <strong>Tempat:</strong> {ticket.locationPlace || ticket.customer.fullName}
                  </div>
                  <div>
                    <strong>Alamat:</strong> {ticket.serviceAddress}
                  </div>
                  <div>
                    <strong>Titik Lokasi:</strong>{' '}
                    {hasCoords
                      ? `${ticket.targetLat!.toFixed(5)}, ${ticket.targetLng!.toFixed(5)}`
                      : 'Mengacu alamat cluster'}
                  </div>
                  {ticket.vendorName && (
                    <div>
                      <strong>Vendor Pelaksana:</strong> {ticket.vendorName}
                    </div>
                  )}
                </div>

                {ticket.rejectionReason && ticket.status !== 'PENDING_APPROVAL' && (
                  <div className="vendor-task-revision">
                    <strong>Perlu Revisi Pusat:</strong> {ticket.rejectionReason}
                  </div>
                )}

                {ticket.adminNotes && (
                  <div className="vendor-task-cs-note">
                    <strong>Catatan CS:</strong> {ticket.adminNotes}
                  </div>
                )}

                {ticket.status === 'PENDING_APPROVAL' && ticket.pendingSubmission && (
                  <div className="vendor-task-pending-info">
                    <strong>Laporan Terkirim ({ticket.pendingSubmission.channel || 'WEB'}):</strong>{' '}
                    {ticket.pendingSubmission.splitterCode} Port{' '}
                    {ticket.pendingSubmission.portNumber} · {ticket.pendingSubmission.attenuationDbm}{' '}
                    dBm
                  </div>
                )}

                <footer className="vendor-task-actions">
                  {hasCoords && (
                    <a
                      href={`https://maps.google.com/?q=${ticket.targetLat},${ticket.targetLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="vendor-action-btn vendor-action-secondary"
                    >
                      <Icon name="mapPin" size={15} />
                      <span>Maps</span>
                    </a>
                  )}

                  {ticket.status === 'OPEN' && (
                    <button
                      type="button"
                      className="vendor-action-btn vendor-action-primary"
                      disabled={startingId === ticket.id}
                      onClick={() => startExecution(ticket)}
                    >
                      <Icon name="wrench" size={15} />
                      <span>
                        {startingId === ticket.id
                          ? 'Memulai...'
                          : 'Mulai Eksekusi di Lokasi'}
                      </span>
                    </button>
                  )}

                  {ticket.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      className="vendor-action-btn vendor-action-success"
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <Icon name="send" size={15} />
                      <span>Kirim Laporan Hasil Terbaru</span>
                    </button>
                  )}

                  {ticket.status === 'PENDING_APPROVAL' && (
                    <button
                      type="button"
                      className="vendor-action-btn vendor-action-secondary"
                      style={{ flex: '1 1 auto' }}
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <Icon name="clock" size={15} />
                      <span>Perbarui Laporan</span>
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      <VendorReportModal
        ticket={selectedTicket}
        splitters={splitters}
        onClose={() => setSelectedTicket(null)}
        onUploadPhoto={uploadOpmPhoto}
        onSubmitReport={submitVendorReport}
      />
    </main>
  );
}
