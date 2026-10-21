'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/ToastProvider';

interface TicketDetailModalProps {
  ticket: any | null;
  onClose: () => void;
  onTicketUpdated?: () => void;
  onMarkCompleted?: (ticketNumber: string) => void;
}

export function TicketDetailModal({
  ticket,
  onClose,
  onTicketUpdated,
}: TicketDetailModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState(
    'Data redaman atau bukti foto OPM belum memenuhi standar toleransi operasional (-22 dBm).'
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
          'Laporan teknisi berhasil disetujui (Accepted). Data Master Pelanggan telah diperbarui.'
      );
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
        json.meta?.message ||
          'Laporan telah ditolak dan dikembalikan ke teknisi untuk perbaikan.'
      );
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
          'Laporan baru dari teknisi berhasil diterima. Siap diverifikasi dan disetujui (Accepted).'
      );
      if (onTicketUpdated) onTicketUpdated();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Gagal mensimulasikan kiriman data');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '620px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="ticket-number-tag">{ticket.ticketNumber}</span>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
              {isPendingApproval
                ? 'Verifikasi & Persetujuan Super Admin'
                : 'Rincian Work Order Lapangan'}
            </h2>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px 24px' }}>
          {/* Status Workflow Banners without Cliché AI Icons */}
          {isPending && (
            <div className="ticket-workflow-banner pending">
              <div>
                <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '2px', fontSize: '12.5px' }}>
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
                <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '2px', fontSize: '12.5px' }}>
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '12px', lineHeight: 1.45, color: '#334155' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '2px' }}>
                  Laporan Menunggu Persetujuan Super Admin
                </div>
                <div style={{ color: '#475569' }}>
                  Teknisi telah mengirimkan data hasil ukur redaman dan alokasi port. Sesuai aturan
                  Master Data, data ini <strong>tidak dapat langsung masuk</strong> ke sistem sebelum
                  diperiksa dan disetujui (Accepted) oleh Super Admin.
                </div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="ticket-workflow-banner completed">
              <div>
                <div style={{ fontWeight: 600, color: '#166534', marginBottom: '2px', fontSize: '12.5px' }}>
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
              }}
            >
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
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                    Alur Persetujuan Data Lapangan (Super Admin)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Simulasikan kiriman data terbaru dari mobile app ({ticket.assignedTech}) untuk menguji alur verifikasi.
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    background: '#0e5b92',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 2px rgba(14, 91, 146, 0.2)',
                  }}
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
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: '#475569',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#475569' }} />
                <span>Data yang Diajukan oleh Teknisi ({ticket.assignedTech})</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  fontSize: '12px',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dce7f0',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                    Hasil Ukur Redaman (OPM)
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '4px',
                    }}
                  >
                    <span className={attMeta.cls} style={{ fontSize: '11px', padding: '2px 8px' }}>
                      {attMeta.label}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dce7f0',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                    ODP & Port Splitter Diajukan
                  </span>
                  <div
                    style={{
                      fontWeight: 600,
                      color: '#0f172a',
                      marginTop: '4px',
                      fontSize: '12px',
                    }}
                  >
                    {pendingData?.splitterCode || ticket.splitterCode || 'ODP-BDG-03'} · Port{' '}
                    {pendingData?.portNumber || ticket.portNumber || 2}
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dce7f0',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                    Integritas Lokasi (Anti-Fake GPS)
                  </span>
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 500,
                      color: pendingData?.isLocationFlagged ? '#b91c1c' : '#15803d',
                      fontSize: '11.5px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: pendingData?.isLocationFlagged ? '#dc2626' : '#16a34a',
                      }}
                    />
                    <span>
                      {pendingData?.distanceToSplitterM !== undefined
                        ? `${pendingData.distanceToSplitterM}m dari ODP (GPS Valid)`
                        : '15m dari ODP (GPS Valid)'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dce7f0',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                    Waktu Pengiriman Teknisi
                  </span>
                  <div
                    style={{
                      color: '#334155',
                      marginTop: '4px',
                      fontWeight: 500,
                      fontSize: '11.5px',
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
                <div style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                    Catatan Teknisi:
                  </span>
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '5px',
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      color: '#334155',
                      fontStyle: 'italic',
                      marginTop: '4px',
                    }}
                  >
                    "{pendingData.technicianNotes}"
                  </div>
                </div>
              )}

              {/* Photo Proof Card */}
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  background: '#f1f5f9',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                  <Icon name="camera" size={13} />
                  <span>
                    Bukti Foto OPM Terunggah:{' '}
                    <code>
                      {pendingData?.photoObjectKey || 'opm-proofs/2025/02/t-3-opm.webp'}
                    </code>
                  </span>
                </div>
                <span
                  style={{
                    color: '#0e5b92',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '10.5px',
                  }}
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
              <span className="inspector-field-value" style={{ fontWeight: 600 }}>
                {ticket.customerName}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Nomor SIA</span>
              <span className="inspector-field-value">
                <code
                  style={{
                    background: '#f1f5f9',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                  }}
                >
                  {ticket.siaNumber}
                </code>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Tipe Pekerjaan</span>
              <span className="inspector-field-value">
                <span
                  className={`badge ${
                    ticket.ticketType.includes('Pasang') || ticket.ticketType === 'PSB'
                      ? 'blue'
                      : 'neutral'
                  }`}
                >
                  {ticket.ticketType}
                </span>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Status Penugasan</span>
              <span className="inspector-field-value">
                <span
                  className={`badge ${
                    isCompleted
                      ? 'green'
                      : isInProgress
                      ? 'blue'
                      : 'neutral'
                  }`}
                >
                  {ticket.status}
                </span>
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
                <span className={attMeta.cls}>{attMeta.label}</span>
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Waktu Dibuat</span>
              <span
                className="inspector-field-value"
                style={{ fontSize: '11.5px', color: '#64748b' }}
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
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#991b1b',
                  marginBottom: '6px',
                }}
              >
                Alasan Penolakan Laporan (Wajib Diisi):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #fca5a5',
                  fontSize: '12px',
                  color: '#1e293b',
                  resize: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
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

          {/* Action Buttons Footer */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginTop: '18px',
              paddingTop: '14px',
              borderTop: '1px solid #f1f5f9',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {isPendingApproval ? (
              <>
                <button
                  type="button"
                  style={{
                    background: '#ffffff',
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  disabled={isSubmitting}
                  onClick={() => setShowRejectInput(!showRejectInput)}
                >
                  <Icon name="x" size={13} />
                  <span>Tolak Laporan</span>
                </button>

                <button
                  type="button"
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)',
                  }}
                  disabled={isSubmitting}
                  onClick={handleApprove}
                >
                  <Icon name="check" size={14} />
                  <span>{isSubmitting ? 'Menerapkan...' : 'Setujui & Terapkan Data (Accept)'}</span>
                </button>

                <button
                  type="button"
                  className="button secondary"
                  style={{ fontSize: '11.5px', padding: '7px 12px', marginLeft: 'auto' }}
                  onClick={onClose}
                >
                  Tutup
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/network?search=${encodeURIComponent(ticket.cluster)}`}
                  className="button secondary"
                  style={{ fontSize: '11.5px', padding: '7px 12px' }}
                >
                  <Icon name="network" size={13} />
                  <span>Buka di Master Jaringan</span>
                </Link>

                <Link
                  href="/monitoring"
                  className="button secondary"
                  style={{ fontSize: '11.5px', padding: '7px 12px' }}
                >
                  <Icon name="activity" size={13} />
                  <span>Pantau di Live Stream</span>
                </Link>

                <button
                  type="button"
                  className="button primary"
                  style={{ fontSize: '11.5px', padding: '7px 16px', marginLeft: 'auto' }}
                  onClick={onClose}
                >
                  Tutup Rincian
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
