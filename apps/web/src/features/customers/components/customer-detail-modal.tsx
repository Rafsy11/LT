'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import {
  classifyDbm,
  dbmTone,
  isAttenuationBad,
  type CustomerListItem,
  type CustomerRecentTicket,
} from '@repo/shared';
import { useAuth } from '@/providers';
import { CustomerProfileEditModal } from './customer-profile-edit-modal';
import '@/styles/components/customer-modal.css';
import '@/styles/features/customer-profile.css';

interface AttenuationHistoryItem {
  id: string;
  submissionId: string;
  oldAttenuation: number | null;
  newAttenuation: number;
  splitterCode: string;
  portNumber: number;
  photoObjectKey?: string;
  technicianName: string;
  recordedAt: string;
}

interface CustomerDetailModalProps {
  customer: CustomerListItem | null;
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
}

export function CustomerDetailModal({
  customer,
  onClose,
  onUpdated,
}: CustomerDetailModalProps) {
  const { user } = useAuth();
  const isSuperAdmin = user.userType === 'SUPER_ADMIN';

  const [liveCustomer, setLiveCustomer] = useState<CustomerListItem | null>(customer);
  const [histories, setHistories] = useState<AttenuationHistoryItem[]>([]);
  const [recentTickets, setRecentTickets] = useState<CustomerRecentTicket[]>([]);
  const [openTicket, setOpenTicket] = useState<CustomerRecentTicket | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    setLiveCustomer(customer);
  }, [customer]);

  const reloadDetail = (siaNumber: string) => {
    setLoadingHistory(true);
    fetch(`/api/v1/admin/customers?sia=${encodeURIComponent(siaNumber)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          if (json.data.customer) setLiveCustomer(json.data.customer);
          if (Array.isArray(json.data.histories)) setHistories(json.data.histories);
          if (Array.isArray(json.data.recentTickets)) setRecentTickets(json.data.recentTickets);
          setOpenTicket(json.data.openTicket ?? null);
        }
      })
      .catch((err) => console.error('Gagal mengambil detail pelanggan:', err))
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    if (!customer?.siaNumber) return;
    reloadDetail(customer.siaNumber);
  }, [customer?.siaNumber]);

  const activeCustomer = liveCustomer || customer;
  if (!activeCustomer) return null;

  const oltVal = activeCustomer.oltAttenuation ?? null;
  const ontVal = activeCustomer.ontAttenuation ?? activeCustomer.currentAttenuation ?? null;
  const mapsHref = activeCustomer.splitterCode
    ? `/maps?odp=${encodeURIComponent(activeCustomer.splitterCode)}&sia=${encodeURIComponent(activeCustomer.siaNumber)}`
    : `/maps?sia=${encodeURIComponent(activeCustomer.siaNumber)}`;

  return (
    <ModalOverlay onClose={onClose} labelledBy="customer-detail-title">
      <article
        className="modal"
        style={{
          maxWidth: '780px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="panel-heading"
          style={{ padding: '16px 20px', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div className="modal-icon-wrap">
              <Icon name="users" size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 id="customer-detail-title" className="modal-heading">
                  {activeCustomer.fullName}
                </h2>
                <span className="modal-badge-mono">
                  {activeCustomer.siaNumber}
                </span>
                {openTicket && (
                  <span className="cp-tc-open-badge">
                    TC Open: {openTicket.ticketNumber}
                  </span>
                )}
              </div>
              <p className="modal-subheading">
                Cluster: <b>{activeCustomer.cluster}</b> ({activeCustomer.clusterCode})
                {activeCustomer.picName ? ` · PIC: ${activeCustomer.picName}` : ''}
              </p>
            </div>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </header>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Building Photo Preview (if uploaded) */}
          {activeCustomer.photoUrl && (
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }} className="modal-sub-card">
              <img
                src={activeCustomer.photoUrl}
                alt={activeCustomer.photoCaption || `Foto bangunan ${activeCustomer.fullName}`}
                style={{
                  width: '150px',
                  height: '96px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '1px solid var(--color-border, #dce7f0)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Foto &amp; Deskripsi Profil Pelanggan
                </div>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                  {activeCustomer.profileDescription ||
                    activeCustomer.photoCaption ||
                    'Dokumentasi lokasi bangunan pelanggan.'}
                </p>
              </div>
            </div>
          )}

          {!activeCustomer.photoUrl && activeCustomer.profileDescription && (
            <div className="modal-sub-card">
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Deskripsi Profil Pelanggan
              </div>
              <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
                {activeCustomer.profileDescription}
              </p>
            </div>
          )}

          {/* Service Status, PIC & OLT/ONT Attenuation Strip */}
          <div className="modal-three-col-grid">
            <div>
              <div
                style={{
                  fontSize: '10.5px',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Status &amp; Kontak PIC
              </div>
              <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="customer-status-badge" style={{ width: 'fit-content' }}>
                  <span
                    className={`customer-status-dot ${
                      activeCustomer.status === 'ACTIVE'
                        ? 'active'
                        : activeCustomer.status === 'PENDING_INSTALL'
                          ? 'pending'
                          : activeCustomer.status === 'ISOLATED'
                            ? 'isolated'
                            : 'inactive'
                    }`}
                  />
                  <span>
                    {activeCustomer.status === 'ACTIVE'
                      ? 'Aktif'
                      : activeCustomer.status === 'PENDING_INSTALL'
                        ? 'Menunggu PSB'
                        : activeCustomer.status === 'ISOLATED'
                          ? 'Terisolir'
                          : 'Nonaktif'}
                  </span>
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
                  {activeCustomer.picName || 'PIC belum diisi'}
                </span>
                {activeCustomer.picPhone && (
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-muted)' }}>
                    {activeCustomer.picPhone}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '10.5px',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                ODP &amp; Port
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 600 }}>
                {activeCustomer.splitterName || activeCustomer.splitterCode || 'Belum dipetakan'}
              </div>
              <div style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-muted)' }}>
                {activeCustomer.splitterCode || '-'} ·{' '}
                {activeCustomer.portNumber != null ? `Port #${activeCustomer.portNumber}` : 'Tanpa port'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '10.5px',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                Redaman OLT / ONT (Maks. 28 dB)
              </div>
              <div style={{ marginTop: '4px', fontSize: '12.5px', fontWeight: 700 }}>
                OLT: {oltVal != null ? `${oltVal.toFixed(1)} dB` : '-'} · ONT:{' '}
                {ontVal != null ? `${ontVal.toFixed(1)} dB` : '-'}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: isAttenuationBad(ontVal ?? oltVal) ? '#dc2626' : 'var(--color-text-muted)' }}>
                {ontVal == null && oltVal == null
                  ? 'Belum diukur'
                  : isAttenuationBad(ontVal ?? oltVal)
                    ? 'Jelek (> 28 dB)'
                    : `${classifyDbm(ontVal ?? oltVal)} (<= 28 dB)`}
              </span>
            </div>
          </div>

          {/* Last Activity Note & Recent 4 Tickets */}
          {(activeCustomer.lastActivityNote || recentTickets.length > 0) && (
            <div className="modal-sub-card">
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Note Activity Terakhir &amp; Tiket Terbaru ({recentTickets.length})
              </div>
              {activeCustomer.lastActivityNote && (
                <p style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: 1.5 }}>
                  {activeCustomer.lastActivityNote}
                </p>
              )}
              {recentTickets.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {recentTickets.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets?search=${encodeURIComponent(t.ticketNumber)}`}
                      className="cp-sia-chip"
                      style={{ textDecoration: 'none' }}
                    >
                      {t.ticketNumber} ({t.status})
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GPON Datek Technical Specifications */}
          <div className="modal-sub-card gpon-datek-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '8px',
                fontWeight: 600,
              }}
            >
              <Icon name="network" size={13} />
              <span>Spesifikasi Teknis GPON &amp; Koordinat</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
                  Node GPON / Slot OLT
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px', fontWeight: 600 }}>
                  {activeCustomer.gponNode || '-'} / {activeCustomer.oltSlot || '-'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
                  SN Modem ONT
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px', fontWeight: 600 }}>
                  {activeCustomer.ontSn || '-'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
                  LatLog Customer
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px', fontWeight: 600 }}>
                  {activeCustomer.lat != null && activeCustomer.lng != null
                    ? `${activeCustomer.lat.toFixed(5)}, ${activeCustomer.lng.toFixed(5)}`
                    : '-'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
                  LatLog ODP
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px', fontWeight: 600 }}>
                  {activeCustomer.odpLat != null && activeCustomer.odpLng != null
                    ? `${activeCustomer.odpLat.toFixed(5)}, ${activeCustomer.odpLng.toFixed(5)}`
                    : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Alamat & Catatan Lokasi */}
          <div className="modal-sub-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontWeight: 600 }}>
              <Icon name="pin" size={13} />
              <span>Alamat Instalasi</span>
            </div>
            <div style={{ fontSize: '12.5px' }}>{activeCustomer.address}</div>
          </div>

          {/* Attenuation History Section */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600 }}>
                Riwayat Pengukuran Redaman (10 Laporan Terakhir)
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Immutable Audit Trail
              </span>
            </div>

            {loadingHistory ? (
              <div className="ui-text-muted" style={{ padding: '20px', textAlign: 'center', fontSize: '12px' }}>
                Memuat riwayat redaman...
              </div>
            ) : histories.length === 0 ? (
              <EmptyState
                icon="activity"
                title="Belum ada riwayat pengukuran"
                description="Riwayat redaman optik akan tercatat otomatis saat teknisi mengirimkan hasil ukur OPM lapangan."
                size="compact"
              />
            ) : (
              <div className="modal-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                  <thead>
                    <tr className="modal-table-header-row">
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Waktu Pencatatan</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Nilai Redaman</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Splitter &amp; Port</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Teknisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histories.map((h) => {
                      const histTone = dbmTone(h.newAttenuation);
                      return (
                        <tr key={h.id || h.submissionId} className="modal-table-row">
                          <td className="modal-td-muted" style={{ padding: '8px 10px', fontSize: '11px' }}>
                            {new Date(h.recordedAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            WIB
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              className={
                                histTone === 'green'
                                  ? 'ui-text-success-strong'
                                  : histTone === 'orange'
                                    ? 'ui-text-warn'
                                    : 'ui-text-critical-strong'
                              }
                              style={{ fontWeight: 600 }}
                            >
                              {h.newAttenuation.toFixed(1)} dBm
                            </span>
                          </td>
                          <td className="modal-td-text" style={{ padding: '8px 10px' }}>
                            {h.splitterCode}{' '}
                            <span className="modal-td-highlight" style={{ fontFamily: 'monospace' }}>
                              #{h.portNumber}
                            </span>
                          </td>
                          <td className="modal-td-muted" style={{ padding: '8px 10px' }}>
                            {h.technicianName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Links */}
        <footer className="modal-footer" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div role="group" aria-label="Aksi rincian pelanggan" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              href={`/customers/${encodeURIComponent(activeCustomer.siaNumber)}`}
              className="button primary"
              onClick={onClose}
            >
              <Icon name="userCheck" size={13} />
              <span>Buka Profil Lengkap</span>
            </Link>
            <Link href={mapsHref} className="button secondary" onClick={onClose}>
              <Icon name="map" size={13} />
              <span>Lihat di Peta ODP</span>
            </Link>
            {isSuperAdmin && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditModalOpen(true)}
              >
                <Icon name="edit" size={13} />
                <span>Edit Profil</span>
              </button>
            )}
          </div>

          <button onClick={onClose} className="button" type="button">
            Tutup
          </button>
        </footer>
      </article>

      {isSuperAdmin && (
        <CustomerProfileEditModal
          customer={activeCustomer}
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={async (updated) => {
            setLiveCustomer(updated);
            reloadDetail(updated.siaNumber);
            await onUpdated?.();
          }}
        />
      )}
    </ModalOverlay>
  );
}
