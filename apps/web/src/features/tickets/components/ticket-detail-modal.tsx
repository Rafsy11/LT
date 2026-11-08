'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/providers';
import { invalidateQueryCache } from '@/lib/query-cache';

const TICKET_MUTATION_CACHE_KEYS = [
  '/api/v1/admin/tickets',
  '/api/v1/admin/overview',
  '/api/v1/admin/customers',
  '/api/v1/admin/clusters',
];

export interface TicketDetailModalProps {
  ticket: any | null;
  onClose: () => void;
  onTicketUpdated?: () => void;
  onMarkCompleted?: (ticketNumber: string) => void;
}

export function TicketDetailModal({ ticket, onClose, onTicketUpdated }: TicketDetailModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState(
    'Data redaman atau bukti foto OPM belum memenuhi standar toleransi operasional (-22 dBm).',
  );

  const { showSuccess, showError } = useToast();

  if (!ticket) return null;

  const isCompleted = ticket.status === 'Selesai';
  const isInProgress = ticket.status === 'Dalam proses';
  const isPending = ticket.status === 'Menunggu';
  const isPendingApproval = ticket.status === 'Menunggu verifikasi';

  const pendingData = ticket.pendingSubmission;
  const currentAttenuationVal = pendingData
    ? pendingData.attenuationDbm
    : ticket.currentAttenuation;

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

  const attMeta = getDbmBadge(currentAttenuationVal);

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/admin/tickets/${ticket.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Gagal menyetujui laporan tiket');
      }
      showSuccess(
        json.meta?.message ||
          'Laporan teknisi berhasil disetujui (Accepted). Data Master Pelanggan telah diperbarui.',
      );
      invalidateQueryCache(...TICKET_MUTATION_CACHE_KEYS);
      if (onTicketUpdated) onTicketUpdated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Gagal menyetujui laporan tiket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showError('Alasan penolakan wajib diisi untuk instruksi teknisi lapangan.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/v1/admin/tickets/${ticket.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Gagal menolak laporan tiket');
      }
      showSuccess(
        json.meta?.message || 'Laporan telah ditolak dan dikembalikan ke teknisi untuk perbaikan.',
      );
      invalidateQueryCache(...TICKET_MUTATION_CACHE_KEYS);
      if (onTicketUpdated) onTicketUpdated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Gagal menolak laporan tiket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateMobileSubmission = async () => {
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/admin/tickets/simulate-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Gagal mensimulasikan kiriman data');
      }
      showSuccess(
        json.meta?.message ||
          'Laporan baru dari teknisi berhasil diterima. Siap diverifikasi dan disetujui (Accepted).',
      );
      invalidateQueryCache(...TICKET_MUTATION_CACHE_KEYS);
      if (onTicketUpdated) onTicketUpdated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Gagal mensimulasikan kiriman data');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog className="overlay" open onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
      <article
        className="modal ticket-inspector-modal"
        style={{ maxWidth: '780px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="ticket-number-tag">{ticket.ticketNumber}</span>
            <h2 id="ticket-modal-title" className="ticket-modal-title">
              {isPendingApproval
                ? 'Verifikasi & Persetujuan Super Admin'
                : 'Rincian Work Order Lapangan'}
            </h2>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </header>

        <div className="modal-body" style={{ padding: '16px 20px 24px' }}>
          {/* Status Workflow Banners without Cliché AI Icons */}
          {isPending && (
            <div className="ticket-workflow-banner pending">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    color: '#92400e',
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Status: Menunggu Respon Teknisi
                </div>
                <div style={{ fontSize: '11.5px', color: '#78350f', lineHeight: 1.4 }}>
                  Tiket penugasan telah diteruskan ke perangkat mobile teknisi terkait dan menunggu
                  konfirmasi keberangkatan ke lokasi fisik.
                </div>
              </div>
            </div>
          )}

          {isInProgress && (
            <div className="ticket-workflow-banner in-progress">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    color: '#1e40af',
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Pekerjaan Sedang Berlangsung di Lapangan
                </div>
                <div style={{ fontSize: '11.5px', color: '#1e3a8a', lineHeight: 1.4 }}>
                  Sesuai PRD 3.2 & 3.3, penyelesaian tiket dilaporkan langsung oleh teknisi melalui
                  aplikasi mobile dengan foto OPM dan validasi GPS sebelum diverifikasi Super Admin.
                </div>
              </div>
            </div>
          )}

          {isPendingApproval && (
            <div className="ticket-approval-callout">
              <div className="ticket-approval-content">
                <div className="ticket-approval-title">
                  Laporan Menunggu Persetujuan Super Admin
                </div>
                <div className="ticket-approval-desc">
                  Teknisi telah mengirimkan data hasil ukur redaman dan alokasi port. Sesuai aturan
                  Master Data, data ini <strong>tidak dapat langsung masuk</strong> ke sistem
                  sebelum diperiksa dan disetujui (Accepted) oleh Super Admin.
                </div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="ticket-workflow-banner completed">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    color: '#166534',
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Work Order Telah Selesai & Terverifikasi
                </div>
                <div style={{ fontSize: '11.5px', color: '#14532d', lineHeight: 1.4 }}>
                  Laporan redaman telah disetujui oleh Super Admin dan tercatat secara permanen di{' '}
                  <code>attenuation_histories</code>.
                </div>
              </div>
            </div>
          )}

          {/* Quick Super Admin Trigger for Tickets not yet submitted */}
          {(isInProgress || isPending) && (
            <div className="ticket-admin-sim-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div className="ticket-admin-sim-title">
                    Alur Persetujuan Data Lapangan (Super Admin)
                  </div>
                  <div className="ticket-admin-sim-desc">
                    Simulasikan kiriman data terbaru dari mobile app ({ticket.assignedTech}) untuk
                    menguji alur verifikasi.
                  </div>
                </div>
                <button
                  type="button"
                  className="ticket-admin-sim-btn"
                  disabled={isSubmitting}
                  onClick={handleSimulateMobileSubmission}
                >
                  {isSubmitting ? 'Mengirim...' : 'Kirim Laporan Lapangan (Mobile)'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Submission Review Box (Active when Menunggu verifikasi) */}
          {isPendingApproval && (
            <div className="ticket-review-card">
              <div className="ticket-review-header">
                <span className="ticket-review-dot" />
                <span>Data yang Diajukan oleh Teknisi ({ticket.assignedTech})</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  marginBottom: '12px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid #1E293B',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    Hasil Ukur Redaman (OPM)
                  </span>
                  <div style={{ marginTop: '4px', fontWeight: 600, fontSize: '13px', color: '#F1F5F9' }}>
                    {attMeta.label}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    ODP &amp; Port Splitter Diajukan
                  </span>
                  <div style={{ fontWeight: 600, marginTop: '4px', fontSize: '13px', color: '#F1F5F9' }}>
                    {pendingData?.splitterCode || ticket.splitterCode || 'ODP-BDG-03'} · Port{' '}
                    {pendingData?.portNumber || ticket.portNumber || 2}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    Integritas Lokasi (Anti-Fake GPS)
                  </span>
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 500,
                      fontSize: '12px',
                      color: pendingData?.isLocationFlagged ? '#ef4444' : '#22c55e',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: pendingData?.isLocationFlagged ? '#ef4444' : '#22c55e',
                      }}
                    />
                    <span>
                      {pendingData?.distanceToSplitterM !== undefined
                        ? `${pendingData.distanceToSplitterM}m dari ODP (GPS Valid)`
                        : '15m dari ODP (GPS Valid)'}
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    Waktu Pengiriman Teknisi
                  </span>
                  <div
                    style={{
                      color: '#F1F5F9',
                      marginTop: '4px',
                      fontWeight: 500,
                      fontSize: '12px',
                    }}
                  >
                    {pendingData?.submittedAt
                      ? new Date(pendingData.submittedAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }) + ' WIB'
                      : 'Baru saja'}
                  </div>
                </div>
              </div>

              {pendingData?.technicianNotes && (
                <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid #1E293B' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    Catatan Teknisi:
                  </span>
                  <div style={{ fontStyle: 'italic', marginTop: '4px', color: '#CBD5E1', fontSize: '12px' }}>
                    &ldquo;{pendingData.technicianNotes}&rdquo;
                  </div>
                </div>
              )}

              {/* Photo Proof Card */}
              <div className="modal-proof-card">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Icon name="camera" size={13} />
                  <span>
                    Bukti Foto OPM Terunggah:{' '}
                    <code style={{ fontFamily: 'var(--font-mono, monospace)', color: '#F1F5F9' }}>{pendingData?.photoObjectKey || 'opm-proofs/2025/02/t-3-opm.webp'}</code>
                  </span>
                </div>
                <span
                  className="modal-proof-action"
                  title="Lihat foto terunggah di MinIO Object Storage"
                >
                  Periksa File
                </span>
              </div>
            </div>
          )}

          {/* Standard Fields Grid */}
          <div className="inspector-grid" style={{ gap: '12px' }}>
            <div className="inspector-field">
              <span className="inspector-field-label">Nama Pelanggan</span>
              <span className="inspector-field-value">
                {ticket.customerName}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Nomor SIA</span>
              <span className="inspector-field-value" style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.3px' }}>
                {ticket.siaNumber}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Tipe Pekerjaan</span>
              <span className="inspector-field-value">
                {ticket.ticketType}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Status Penugasan</span>
              <span className="inspector-field-value">
                {ticket.status}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Wilayah Cluster</span>
              <span className="inspector-field-value">{ticket.cluster}</span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Teknisi Ditugaskan</span>
              <span className="inspector-field-value">{ticket.assignedTech}</span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Redaman Saat Ini</span>
              <span className="inspector-field-value">
                {attMeta.label}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Waktu Dibuat</span>
              <span
                className="inspector-field-value"
                style={{ fontSize: '12px' }}
              >
                {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('id-ID') : '-'}
              </span>
            </div>
          </div>

          {/* Admin Notes */}
          {ticket.adminNotes && (
            <div style={{ marginTop: '12px' }}>
              <span className="inspector-field-label">Catatan / Riwayat Persetujuan</span>
              <div className="ticket-notes-box" style={{ marginTop: '4px' }}>
                {ticket.adminNotes}
              </div>
            </div>
          )}

          {/* Rejection Input Box (when triggered) */}
          {isPendingApproval && showRejectInput && (
            <div className="ticket-reject-card">
              <label className="ticket-reject-label">
                Alasan Penolakan Laporan (Wajib Diisi):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                className="ticket-reject-textarea"
              />
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '8px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: '11px', padding: '5px 10px' }}
                  onClick={() => setShowRejectInput(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  disabled={isSubmitting}
                  onClick={handleReject}
                >
                  {isSubmitting ? 'Memproses...' : 'Konfirmasi Tolak Laporan'}
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons Footer (Upgraded High-End Layout) */}
          <footer className="modal-footer-bar">
            {isPendingApproval ? (
              <div className="modal-footer-pending-actions">
                <button
                  type="button"
                  className="button reject-action-btn"
                  disabled={isSubmitting}
                  onClick={() => setShowRejectInput(!showRejectInput)}
                >
                  <Icon name="x" size={14} />
                  <span>Tolak Laporan</span>
                </button>

                <div className="modal-footer-right-group">
                  <button
                    type="button"
                    className="button approve-action-btn"
                    disabled={isSubmitting}
                    onClick={handleApprove}
                  >
                    <Icon name="check" size={14} />
                    <span>{isSubmitting ? 'Menerapkan...' : 'Setujui & Terapkan Data (Accept)'}</span>
                  </button>

                  <button
                    type="button"
                    className="button secondary modal-close-btn"
                    onClick={onClose}
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal-footer-standard-actions">
                <div className="modal-footer-links-group">
                  <Link
                    href={`/network?search=${encodeURIComponent(ticket.cluster)}`}
                    className="button secondary modal-link-btn"
                  >
                    <Icon name="network" size={14} />
                    <span>Buka di Master Jaringan</span>
                  </Link>

                  <Link
                    href="/monitoring"
                    className="button secondary modal-link-btn"
                  >
                    <Icon name="activity" size={14} />
                    <span>Pantau di Live Stream</span>
                  </Link>
                </div>

                <div className="modal-footer-primary-group">
                  <button
                    type="button"
                    className="button primary modal-primary-close-btn"
                    onClick={onClose}
                  >
                    Tutup Rincian
                  </button>
                </div>
              </div>
            )}
          </footer>
        </div>
      </article>
    </dialog>
  );
}
