'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';
import { CreateTicketInput } from '@repo/shared';

export interface DbTicketPendingSubmission {
  submissionId: string;
  splitterId: string;
  splitterCode: string;
  portNumber: number;
  attenuationDbm: number;
  photoObjectKey: string;
  submittedLat: number;
  submittedLng: number;
  distanceToSplitterM: number;
  isLocationFlagged: boolean;
  clientRecordedAt?: string;
  technicianNotes?: string;
  submittedAt: string;
  techUsername: string;
  techFullName: string;
}

export interface TicketItem {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: string;
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  pendingSubmission?: DbTicketPendingSubmission;
}

export default function TicketsPage() {
  const [tab, setTab] = useState('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [typeFilter, setTypeFilter] = useState('Semua tipe');
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { canCreateTicket } = useAuth();
  const { showError, showSuccess } = useToast();

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/tickets');
      const json = await res.json();
      if (json.success && json.data) {
        setTickets(json.data);
      }
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreateTicket = async (data: CreateTicketInput) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    showSuccess(`Tiket ${data.ticketType} untuk ${data.customerName} berhasil dibuat.`);
    await fetchTickets();
  };

  const handleSimulateSubmission = async () => {
    try {
      setSimulating(true);
      const res = await fetch('/api/v1/admin/tickets/simulate-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        showSuccess('Data hasil ukur teknisi mobile berhasil diterima untuk diverifikasi.');
        await fetchTickets();
        setTab('Semua');
      } else {
        showError(json.error || 'Gagal mensimulasikan data teknisi.');
      }
    } catch (err) {
      showError(err);
    } finally {
      setSimulating(false);
    }
  };

  // Scoped tickets by Cluster and Search query
  const scoped = tickets.filter((r) => {
    const matchesCluster =
      cluster === 'Semua cluster' ||
      r.cluster.toLowerCase().includes(cluster.replace('Bandung ', '').toLowerCase());
    const matchesType =
      typeFilter === 'Semua tipe' || r.ticketType.toLowerCase().includes(typeFilter.toLowerCase());
    const matchesSearch =
      search.trim() === '' ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.assignedTech.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesType && matchesSearch;
  });

  // Tab filter
  const filtered = scoped.filter((r) => tab === 'Semua' || r.status === tab);

  const waitingCount = scoped.filter((r) => r.status === 'Menunggu').length;
  const inProgressCount = scoped.filter((r) => r.status === 'Dalam proses').length;
  const pendingApprovalCount = scoped.filter((r) => r.status === 'Menunggu verifikasi').length;
  const completedCount = scoped.filter((r) => r.status === 'Selesai').length;

  const getDbmBadge = (att: number | undefined) => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', cls: 'badge gray' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, cls: 'badge green' };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, cls: 'badge yellow' };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, cls: 'badge red' };
  };

  return (
    <main className="tickets-page">
      {/* Page Heading matching Enterprise System */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">WORK ORDER & FIELD DISPATCH MANAGEMENT</div>
          <h1 className="overview-greeting">Tiket & Penugasan Lapangan</h1>
          <p className="overview-subtitle">
            Disposisi pekerjaan Pasang Baru (PSB) dan Pemeliharaan (Maintenance) ke teknisi lapangan.
          </p>
        </div>

        <div className="overview-toolbar">
          <button
            className="button secondary"
            onClick={handleSimulateSubmission}
            disabled={simulating}
            type="button"
            title="Terima data terbaru yang dikirim teknisi dari mobile app"
            style={{ fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="activity" size={14} />
            <span>{simulating ? 'Menerima Data...' : '+ Terima Data Teknisi (Mobile)'}</span>
          </button>

          {canCreateTicket ? (
            <button
              className="button primary"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              <Icon name="plus" size={15} />
              <span>Buat Tiket Baru</span>
            </button>
          ) : (
            <button
              className="button disabled"
              disabled
              title="Izin ticket:create diperlukan untuk membuat tiket baru"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              type="button"
            >
              <Icon name="lock" size={14} />
              <span>Buat Tiket (Terkunci)</span>
            </button>
          )}

          <button
            className="refresh-btn"
            onClick={fetchTickets}
            type="button"
            aria-label="Segarkan data tiket"
            title="Segarkan data tiket"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 3 Telemetry Metrics Grid */}
      <section
        className="tickets-stats-grid"
        aria-label="Statistik Penugasan Tiket"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
      >
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round">
                <Icon name="ticket" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Total Work Order</span>
                <div className="stat-card-value">{scoped.length}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Seluruh tiket penugasan</span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="clock" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Menunggu Teknisi</span>
                <div className="stat-card-value">{waitingCount}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Menunggu konfirmasi lapangan</span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="wrench" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Dalam Pengerjaan</span>
                <div className="stat-card-value" style={{ color: '#2563eb' }}>
                  {inProgressCount}
                </div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Pengerjaan fisik berlangsung</span>
            </div>
          </div>
        </article>
      </section>

      {/* Filter Toolbar without Clutter Pills */}
      <section className="tickets-toolbar">
        <div className="tickets-filter-group">
          <div className="tickets-search-input">
            <Icon name="search" size={15} />
            <input
              type="text"
              aria-label="Cari tiket"
              placeholder="Cari nomor tiket, SIA, pelanggan, atau teknisi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="select-wrapper">
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filter Wilayah Cluster"
              className="cluster-select"
            >
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
              <option>Bandung Selatan</option>
              <option>Cimahi</option>
              <option>Rancaekek</option>
            </select>
          </div>

          <div className="select-wrapper">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter Tipe Pekerjaan"
              className="cluster-select"
            >
              <option value="Semua tipe">Semua tipe pekerjaan</option>
              <option value="Pasang baru">Pasang baru (PSB)</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Perbaikan">Perbaikan redaman</option>
            </select>
          </div>
        </div>
      </section>

      {/* Segmented Status Tabs Bar (3 Clean Tabs: Semua, Menunggu, Dalam proses) */}
      <div className="tickets-tabs-bar" role="tablist" aria-label="Filter Status Tiket">
        {[
          { label: 'Semua', count: scoped.length },
          { label: 'Menunggu', count: waitingCount },
          { label: 'Dalam proses', count: inProgressCount },
        ].map((item) => (
          <button
            key={item.label}
            role="tab"
            aria-selected={tab === item.label}
            className={`ticket-tab-btn ${tab === item.label ? 'active' : ''}`}
            onClick={() => setTab(item.label)}
          >
            <span>{item.label}</span>
            <span className="ticket-tab-count">{item.count}</span>
          </button>
        ))}
      </div>

      {/* Work Order Cards Grid */}
      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
          Memuat daftar work order...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #dce7f0',
          }}
        >
          <p style={{ fontWeight: 600, color: '#0f172a' }}>
            Tidak ada tiket yang cocok dengan filter pencarian.
          </p>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Coba ubah kata kunci atau pilih tab status yang lain.
          </p>
        </div>
      ) : (
        <div className="tickets-cards-grid">
          {filtered.map((r) => {
            const isCompleted = r.status === 'Selesai';
            const isInProgress = r.status === 'Dalam proses';
            const isPendingApproval = r.status === 'Menunggu verifikasi';
            const displayAttenuation = r.pendingSubmission?.attenuationDbm ?? r.currentAttenuation;
            const att = getDbmBadge(displayAttenuation);

            return (
              <article
                key={r.ticketNumber}
                className="ticket-card"
                onClick={() => setSelectedTicket(r)}
                tabIndex={0}
                role="button"
                aria-label={`Lihat tiket ${r.ticketNumber} untuk ${r.customerName}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTicket(r);
                  }
                }}
              >
                {/* Header Row */}
                <div className="ticket-card-header">
                  <span className="ticket-number-tag">{r.ticketNumber}</span>
                  <div className="ticket-badges-group">
                    <span
                      className={`badge ${
                        r.ticketType.includes('Pasang') || r.ticketType === 'PSB'
                          ? 'blue'
                          : 'neutral'
                      }`}
                      style={{ fontSize: '10.5px' }}
                    >
                      {r.ticketType}
                    </span>
                    <span
                      className={`badge ${
                        isCompleted
                          ? 'green'
                          : isInProgress
                          ? 'blue'
                          : 'neutral'
                      }`}
                      style={{ fontSize: '10.5px' }}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="ticket-card-body">
                  <h3 className="ticket-customer-name">{r.customerName}</h3>
                  <div className="ticket-meta-row">
                    <code
                      style={{
                        background: '#f1f5f9',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '11px',
                      }}
                    >
                      {r.siaNumber}
                    </code>
                    <span>·</span>
                    <span>{r.cluster}</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '2px',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {isPendingApproval ? 'Hasil Ukur Diajukan:' : 'Redaman:'}
                    </span>
                    <span
                      className={att.cls}
                      style={{ fontSize: '10.5px', padding: '2px 6px' }}
                    >
                      {att.label}
                    </span>
                  </div>

                  {/* Super Admin Review Callout on Card without AI Slop Icons and Yellow Colors */}
                  {isPendingApproval && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '11px',
                        color: '#334155',
                        marginTop: '4px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        Verifikasi Persetujuan Admin
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                        ODP:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {r.pendingSubmission?.splitterCode || r.splitterCode || 'ODP'}
                        </strong>{' '}
                        · Port:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {r.pendingSubmission?.portNumber || r.portNumber || 1}
                        </strong>
                      </div>
                    </div>
                  )}

                  {r.adminNotes && !isPendingApproval && (
                    <div className="ticket-notes-box">{r.adminNotes}</div>
                  )}
                </div>

                {/* Footer Row */}
                <div className="ticket-card-footer">
                  <div className="ticket-tech-assigned">
                    <span className="tech-avatar-circle">{r.techInitials || 'TK'}</span>
                    <span>{r.assignedTech}</span>
                  </div>
                  <span className="ticket-action-hint">
                    {isPendingApproval ? 'Tinjau' : 'Detail'} <Icon name="arrow" size={12} />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Ticket Create Modal */}
      <CreateTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateTicket}
      />

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onTicketUpdated={fetchTickets}
      />
    </main>
  );
}
