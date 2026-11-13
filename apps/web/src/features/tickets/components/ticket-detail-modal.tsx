'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useToast, useAuth } from '@/providers';
import { invalidateQueryCache } from '@/lib/query-cache';
import type { TechnicianListItem } from '@repo/shared';
import '@/styles/components/ticket-modal.css';

const TICKET_MUTATION_CACHE_KEYS = [
  '/api/v1/admin/tickets',
  '/api/v1/admin/overview',
  '/api/v1/admin/customers',
  '/api/v1/admin/clusters',
  '/api/v1/tech/tickets',
];

export interface TicketModalData {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: string;
  cluster: string;
  assignedTech: string;
  assignedTechUsername?: string;
  vendorName?: string;
  techInitials?: string;
  status: string;
  currentAttenuation: number;
  complaintSummary?: string;
  customerPhone?: string;
  serviceAddress?: string;
  locationPlace?: string;
  targetLat?: number;
  targetLng?: number;
  dispatchedAt?: string;
  startedAt?: string;
  rejectionReason?: string;
  adminNotes?: string;
  createdAt?: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  pendingSubmission?: import('@repo/shared').DbTicketPendingSubmission;
}

export interface TicketDetailModalProps {
  ticket: TicketModalData | null;
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
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoIsMockFallback, setPhotoIsMockFallback] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [loadedPhotoKey, setLoadedPhotoKey] = useState<string | null>(null);

  const [showDispatchEdit, setShowDispatchEdit] = useState(false);
  const [vendors, setVendors] = useState<TechnicianListItem[]>([]);
  const [editTechUsername, setEditTechUsername] = useState('');
  const [editVendorName, setEditVendorName] = useState('');
  const [editLocationPlace, setEditLocationPlace] = useState('');
  const [editServiceAddress, setEditServiceAddress] = useState('');
  const [editTargetLat, setEditTargetLat] = useState('');
  const [editTargetLng, setEditTargetLng] = useState('');

  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();

  useEffect(() => {
    if (!ticket) return;
    setShowDispatchEdit(false);
    setShowRejectInput(false);
    setEditTechUsername(
      ticket.assignedTechUsername || ticket.assignedTech.toLowerCase().replace(/\s+/g, '.'),
    );
    setEditVendorName(ticket.vendorName || '');
    setEditLocationPlace(ticket.locationPlace || '');
    setEditServiceAddress(ticket.serviceAddress || '');
    setEditTargetLat(typeof ticket.targetLat === 'number' ? String(ticket.targetLat) : '');
    setEditTargetLng(typeof ticket.targetLng === 'number' ? String(ticket.targetLng) : '');

    if (canCreateTicket) {
      fetch('/api/v1/admin/technicians')
        .then((r) => r.json())
        .then((json) => {
          if (json?.success && Array.isArray(json.data)) {
            setVendors(json.data as TechnicianListItem[]);
          }
        })
        .catch(() => {});
    }
  }, [ticket, canCreateTicket]);

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
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal menyetujui laporan tiket');
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
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal menolak laporan tiket');
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
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal mensimulasikan kiriman data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInspectPhoto = async () => {
    const objectKey = pendingData?.photoObjectKey || 'opm-proofs/2025/02/t-3-opm.webp';
    if (photoPreviewOpen && loadedPhotoKey === objectKey) {
      setPhotoPreviewOpen(false);
      return;
    }

    try {
      setPhotoPreviewOpen(true);
      setPhotoLoading(true);
      setPhotoError(null);
      const res = await fetch(
        `/api/v1/admin/media/presign?key=${encodeURIComponent(objectKey)}`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: { url?: string; isMockFallback?: boolean };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data?.url) {
        throw new Error(json.error?.message || 'Gagal mengambil URL foto bukti dari MinIO.');
      }
      setPhotoUrl(json.data.url);
      setPhotoIsMockFallback(Boolean(json.data.isMockFallback));
      setLoadedPhotoKey(objectKey);
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error ? err.message : 'Gagal memuat pratinjau foto OPM.',
      );
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSaveDispatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const latNum = editTargetLat.trim() !== '' ? Number(editTargetLat) : undefined;
      const lngNum = editTargetLng.trim() !== '' ? Number(editTargetLng) : undefined;
      const res = await fetch(`/api/v1/admin/tickets/${ticket.id}/dispatch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedTechUsername: editTechUsername || undefined,
          vendorName: editVendorName.trim() || undefined,
          locationPlace: editLocationPlace.trim() || undefined,
          serviceAddress: editServiceAddress.trim() || undefined,
          targetLat: latNum !== undefined && !Number.isNaN(latNum) ? latNum : undefined,
          targetLng: lngNum !== undefined && !Number.isNaN(lngNum) ? lngNum : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal memperbarui disposisi vendor');
      }
      showSuccess(json.meta?.message || 'Disposisi vendor & titik lokasi berhasil diperbarui.');
      invalidateQueryCache(...TICKET_MUTATION_CACHE_KEYS);
      setShowDispatchEdit(false);
      if (onTicketUpdated) onTicketUpdated();
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal memperbarui disposisi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCoords = () => {
    if (ticket.targetLat === undefined || ticket.targetLng === undefined) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${ticket.targetLat}, ${ticket.targetLng}`);
      showSuccess('Titik koordinat berhasil disalin ke clipboard.');
    }
  };

  const hasCoords =
    typeof ticket.targetLat === 'number' && typeof ticket.targetLng === 'number';
  const currentStep = isCompleted ? 4 : isPendingApproval ? 3 : isInProgress ? 2 : 1;

  return (
    <ModalOverlay onClose={onClose} labelledBy="ticket-modal-title">
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
                ? 'Verifikasi & Persetujuan Pusat Lintasarta'
                : 'Rincian Work Order & Disposisi Vendor'}
            </h2>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </header>

        <div className="modal-body" style={{ padding: '16px 20px 24px' }}>
          {/* 4-Step End-to-End Operational Tracker */}
          <div className="ticket-stepper" aria-label="Tahap Alur Kerja">
            {[
              { step: 1, title: 'Aduan & Disposisi' },
              { step: 2, title: 'Vendor Eksekusi' },
              { step: 3, title: 'Laporan Masuk' },
              { step: 4, title: 'Verifikasi Pusat' },
            ].map((item) => {
              const stateCls =
                item.step < currentStep || (currentStep === 4 && item.step === 4)
                  ? 'done'
                  : item.step === currentStep
                    ? 'active'
                    : '';
              return (
                <div key={item.step} className={`ticket-step-item ${stateCls}`}>
                  <span className="ticket-step-num">Tahap {item.step}</span>
                  <span className="ticket-step-label">{item.title}</span>
                </div>
              );
            })}
          </div>

          {ticket.rejectionReason && isInProgress && (
            <aside className="ticket-rejection-alert" role="alert">
              <strong>Revisi Diperlukan (Penolakan Pusat Sebelumnya):</strong>{' '}
              {ticket.rejectionReason}
            </aside>
          )}

          {/* Customer Complaint, Location Place & Coordinates */}
          <section className="ticket-location-card" aria-label="Lokasi & Aduan Pelanggan">
            <div className="ticket-location-head">
              <div>
                <span className="inspector-field-label">Tempat &amp; Alamat Lokasi Tugas</span>
                <div style={{ fontWeight: 700, fontSize: '13.5px', marginTop: '2px' }}>
                  {ticket.locationPlace || ticket.customerName}
                </div>
                <div className="ticket-location-address">
                  {ticket.serviceAddress || `Cluster ${ticket.cluster}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {hasCoords && (
                  <>
                    <a
                      href={`https://maps.google.com/?q=${ticket.targetLat},${ticket.targetLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button secondary modal-link-btn"
                      style={{ padding: '6px 10px', fontSize: '11.5px' }}
                    >
                      <Icon name="mapPin" size={13} />
                      <span>
                        Maps ({ticket.targetLat!.toFixed(5)}, {ticket.targetLng!.toFixed(5)})
                      </span>
                    </a>
                    <button
                      type="button"
                      className="button secondary modal-link-btn"
                      style={{ padding: '6px 10px', fontSize: '11.5px' }}
                      onClick={handleCopyCoords}
                    >
                      Salin Titik
                    </button>
                  </>
                )}

                {canCreateTicket && (isPending || isInProgress) && (
                  <button
                    type="button"
                    className="button secondary modal-link-btn"
                    style={{ padding: '6px 10px', fontSize: '11.5px' }}
                    onClick={() => setShowDispatchEdit((prev) => !prev)}
                  >
                    <Icon name="wrench" size={13} />
                    <span>{showDispatchEdit ? 'Batal Ubah' : 'Ubah Disposisi'}</span>
                  </button>
                )}
              </div>
            </div>

            {ticket.complaintSummary && (
              <div style={{ fontSize: '12px', lineHeight: 1.45, paddingTop: '4px' }}>
                <strong>Aduan / Permintaan Pelanggan:</strong> {ticket.complaintSummary}
              </div>
            )}

            {showDispatchEdit && (
              <form className="ticket-dispatch-edit-box" onSubmit={handleSaveDispatch}>
                <div className="ticket-form-grid">
                  <label>
                    Vendor / Teknisi Pelaksana
                    <select
                      value={editTechUsername}
                      onChange={(e) => {
                        const uname = e.target.value;
                        setEditTechUsername(uname);
                        const match = vendors.find((v) => v.username === uname);
                        if (match?.vendorCompany) {
                          setEditVendorName(match.vendorCompany);
                        }
                      }}
                    >
                      {vendors.length > 0 ? (
                        vendors.map((v) => (
                          <option key={v.id} value={v.username}>
                            {v.fullName} - {v.vendorCompany || 'Vendor Lapangan'}
                          </option>
                        ))
                      ) : editTechUsername ? (
                        <option value={editTechUsername}>{editTechUsername}</option>
                      ) : (
                        <option value="">Daftar vendor belum tersedia</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Nama Perusahaan Vendor
                    <input
                      value={editVendorName}
                      onChange={(e) => setEditVendorName(e.target.value)}
                      placeholder="PT / CV Vendor"
                    />
                  </label>
                  <label>
                    Nama Tempat / Patokan
                    <input
                      value={editLocationPlace}
                      onChange={(e) => setEditLocationPlace(e.target.value)}
                    />
                  </label>
                  <label>
                    Alamat Lokasi
                    <input
                      value={editServiceAddress}
                      onChange={(e) => setEditServiceAddress(e.target.value)}
                    />
                  </label>
                  <label>
                    Latitude Target
                    <input
                      type="number"
                      step="any"
                      value={editTargetLat}
                      onChange={(e) => setEditTargetLat(e.target.value)}
                    />
                  </label>
                  <label>
                    Longitude Target
                    <input
                      type="number"
                      step="any"
                      value={editTargetLng}
                      onChange={(e) => setEditTargetLng(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={isSubmitting}
                    style={{ width: 'auto', marginTop: 0, padding: '8px 16px', fontSize: '12px' }}
                  >
                    {isSubmitting ? 'Menyimpan...' : 'Simpan & Kirim Notif ke Vendor'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Status Workflow Banners without Cliché AI Icons */}
          {isPending && (
            <div className="ticket-workflow-banner pending ui-alert-banner--warn">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Status: Menunggu Konfirmasi Vendor di Lokasi
                </div>
                <div className="ui-alert-banner-sub" style={{ fontSize: '11.5px', lineHeight: 1.4 }}>
                  Penugasan beserta alamat dan titik lokasi telah dikirim ke Vendor via Portal Web,
                  Aplikasi Mobile, dan Bot Telegram.
                </div>
              </div>
            </div>
          )}

          {isInProgress && (
            <div className="ticket-workflow-banner in-progress ui-alert-banner--info">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Vendor Sedang Mengeksekusi di Lokasi Pelanggan
                </div>
                <div className="ui-alert-banner-sub" style={{ fontSize: '11.5px', lineHeight: 1.4 }}>
                  Vendor dapat mengirimkan laporan terbaru beserta bukti foto OPM dan lokasi melalui
                  Portal Web Vendor (/vendor), Mobile App, atau Bot Telegram (/lapor).
                </div>
              </div>
            </div>
          )}

          {isPendingApproval && (
            <div className="ticket-approval-callout">
              <div className="ticket-approval-content">
                <div className="ticket-approval-title">
                  Laporan Vendor Menunggu Persetujuan Pusat Lintasarta
                </div>
                <div className="ticket-approval-desc">
                  Vendor telah mengirimkan hasil ukur redaman dan port splitter terbaru. Data belum
                  memperbarui Master Pelanggan sebelum diverifikasi dan disetujui (Accepted) oleh
                  Pusat Lintasarta.
                </div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="ticket-workflow-banner completed ui-alert-banner--success">
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: '2px',
                    fontSize: '12.5px',
                  }}
                >
                  Work Order Telah Selesai &amp; Terverifikasi
                </div>
                <div
                  className="ui-alert-banner-sub"
                  style={{
                    fontSize: '11.5px',
                    lineHeight: 1.4,
                  }}
                >
                  Laporan redaman telah disetujui oleh Pusat Lintasarta dan tercatat secara permanen
                  pada riwayat jaringan.
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
                    Simulasi Pengiriman Laporan Lapangan
                  </div>
                  <div className="ticket-admin-sim-desc">
                    Simulasikan kiriman data terbaru dari vendor ({ticket.assignedTech}) untuk
                    menguji alur verifikasi Pusat.
                  </div>
                </div>
                <button
                  type="button"
                  className="ticket-admin-sim-btn"
                  disabled={isSubmitting}
                  onClick={handleSimulateMobileSubmission}
                >
                  {isSubmitting ? 'Mengirim...' : 'Simulasi Kirim Laporan'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Submission Review Box (Active when Menunggu verifikasi) */}
          {isPendingApproval && (
            <div className="ticket-review-card">
              <div className="ticket-review-header">
                <span className="ticket-review-dot" />
                <span>
                  Laporan Terbaru oleh {ticket.assignedTech}
                  {ticket.vendorName ? ` (${ticket.vendorName})` : ''}
                </span>
                {pendingData?.channel && (
                  <span className="ticket-channel-badge" style={{ marginLeft: 'auto' }}>
                    Via {pendingData.channel}
                  </span>
                )}
              </div>

              <div className="ticket-pending-summary-card">
                <div>
                  <span className="ticket-pending-label">
                    Hasil Ukur Redaman (OPM)
                  </span>
                  <div className="ticket-pending-value">
                    {attMeta.label}
                  </div>
                </div>

                <div>
                  <span className="ticket-pending-label">
                    ODP &amp; Port Splitter Diajukan
                  </span>
                  <div className="ticket-pending-value">
                    {pendingData?.splitterCode || ticket.splitterCode || 'ODP-BDG-03'} · Port{' '}
                    {pendingData?.portNumber || ticket.portNumber || 2}
                  </div>
                </div>

                <div>
                  <span className="ticket-pending-label">
                    Integritas Lokasi (Anti-Fake GPS)
                  </span>
                  <div
                    className={pendingData?.isLocationFlagged ? 'ui-text-danger' : 'ui-text-ok'}
                    style={{
                      marginTop: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 500,
                      fontSize: '12px',
                    }}
                  >
                    <span
                      className={`status-dot ${
                        pendingData?.isLocationFlagged ? 'status-dot--danger' : 'status-dot--ok'
                      }`}
                    />
                    <span>
                      {pendingData?.distanceToSplitterM !== undefined
                        ? `${pendingData.distanceToSplitterM}m dari ODP (GPS Valid)`
                        : '15m dari ODP (GPS Valid)'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="ticket-pending-label">
                    Waktu Pengiriman Teknisi
                  </span>
                  <div className="ticket-pending-time">
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
                <div className="ticket-pending-notes-card">
                  <span className="ticket-pending-label">
                    Catatan Teknisi:
                  </span>
                  <div className="ticket-pending-notes-text">
                    &ldquo;{pendingData.technicianNotes}&rdquo;
                  </div>
                </div>
              )}

              {/* Photo Proof Card */}
              <div className="modal-proof-card">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}
                >
                  <Icon name="camera" size={13} />
                  <span>
                    Bukti Foto OPM Terunggah:{' '}
                    <code className="modal-proof-code">
                      {pendingData?.photoObjectKey || 'opm-proofs/2025/02/t-3-opm.webp'}
                    </code>
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-proof-action"
                  title="Lihat foto terunggah di MinIO Object Storage"
                  onClick={handleInspectPhoto}
                >
                  {photoPreviewOpen ? 'Tutup Pratinjau' : 'Periksa File'}
                </button>
              </div>

              {photoPreviewOpen && (
                <div className="modal-proof-preview">
                  {photoLoading ? (
                    <div className="modal-proof-preview-status">
                      Meminta URL presigned dari MinIO Object Storage...
                    </div>
                  ) : photoError ? (
                    <div className="modal-proof-preview-error">
                      {photoError}
                    </div>
                  ) : photoIsMockFallback ? (
                    <div className="modal-proof-preview-fallback">
                      <div className="modal-proof-fallback-title">
                        Mode Simulasi Lokal (MinIO Belum Aktif di Lingkungan Ini)
                      </div>
                      <div className="modal-proof-fallback-meta">
                        Object Key: <code>{pendingData?.photoObjectKey || 'opm-proofs/2025/02/t-3-opm.webp'}</code>
                      </div>
                      {photoUrl && (
                        <div className="modal-proof-fallback-meta">
                          Endpoint Tujuan: <code>{photoUrl}</code>
                        </div>
                      )}
                    </div>
                  ) : photoUrl ? (
                    <div className="modal-proof-image-wrap">
                      <Image
                        src={photoUrl}
                        alt={`Bukti foto OPM ${ticket.ticketNumber}`}
                        width={480}
                        height={280}
                        unoptimized
                        className="modal-proof-image"
                      />
                      <a
                        href={photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal-proof-external-link"
                      >
                        Buka Resolusi Penuh
                      </a>
                    </div>
                  ) : null}
                </div>
              )}
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
              <span className="inspector-field-label">Vendor / Teknisi Lapangan</span>
              <span className="inspector-field-value">
                {ticket.assignedTech}
                {ticket.vendorName ? ` (${ticket.vendorName})` : ''}
              </span>
            </div>

            <div className="inspector-field">
              <span className="inspector-field-label">Kontak Pelanggan</span>
              <span className="inspector-field-value">{ticket.customerPhone || '-'}</span>
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
                  className="button ui-btn-solid-danger"
                  style={{
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
    </ModalOverlay>
  );
}
