'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  classifyDbm,
  dbmTone,
  isAttenuationBad,
  STANDARD_ERROR_MESSAGES,
  type CustomerProfileDetail,
} from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { useAuth, useToast } from '@/providers';
import { CustomerProfileEditModal } from './customer-profile-edit-modal';
import '@/styles/features/customer-profile.css';

interface CustomerProfileViewProps {
  sia: string;
}

const EARTH_RADIUS_M = 6_371_000;

function computeDistanceMeters(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null,
): number | null {
  if (
    typeof lat1 !== 'number' ||
    typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lng2 !== 'number' ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatWaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function dbmStatusClass(val: number | null | undefined): string {
  const status = classifyDbm(val);
  if (status === 'Normal') return 'is-normal';
  if (status === 'Warning') return 'is-warning';
  if (status === 'Critical') return 'is-critical';
  return '';
}

function dbmFriendlyLabel(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'Belum diukur';
  if (isAttenuationBad(val)) return 'Jelek (> 28 dB)';
  const status = classifyDbm(val);
  return status === 'Warning' ? 'Bagus (Mendekati 28 dB)' : 'Bagus / Normal';
}

function ticketStatusMeta(status: string): { label: string; cls: string } {
  if (status === 'OPEN') return { label: 'TC Open', cls: 'is-open' };
  if (status === 'IN_PROGRESS' || status === 'PENDING_APPROVAL') {
    return { label: status === 'IN_PROGRESS' ? 'Dikerjakan' : 'Verifikasi QA', cls: 'is-progress' };
  }
  if (status === 'COMPLETED') return { label: 'Selesai', cls: 'is-done' };
  return { label: status, cls: '' };
}

export function CustomerProfileView({ sia }: CustomerProfileViewProps) {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const isSuperAdmin = user.userType === 'SUPER_ADMIN';

  const [detail, setDetail] = useState<CustomerProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await webApiClient.get<CustomerProfileDetail>(
        `/api/v1/admin/customers?sia=${encodeURIComponent(sia)}`,
      );
      if (!res.success || !res.data?.customer) {
        throw normalizeAppError(!res.success ? res.error : null, {
          fallbackMessage: 'Profil pelanggan tidak ditemukan.',
        });
      }
      setDetail(res.data);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, {
        fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
      });
      setLoadError(normalized.message);
    } finally {
      setLoading(false);
    }
  }, [sia]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} disalin ke papan klip.`);
    } catch {
      showError('Gagal menyalin teks ke papan klip.');
    }
  };

  if (loading && !detail) {
    return (
      <main className="customer-profile-page" id="main-content">
        <div className="cp-card" style={{ padding: '32px', textAlign: 'center' }}>
          Memuat profil lengkap pelanggan SIA {sia}...
        </div>
      </main>
    );
  }

  if (loadError && !detail) {
    return (
      <main className="customer-profile-page" id="main-content">
        <nav className="cp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/customers" className="cp-breadcrumb-link">
            <Icon name="arrowLeft" size={14} />
            <span>Kembali ke Master Pelanggan (SIA)</span>
          </Link>
        </nav>
        <SafeErrorState
          error={loadError}
          title="Profil Pelanggan Belum Dapat Dimuat"
          description={loadError}
          onRetry={() => void loadProfile()}
          variant="panel"
        />
      </main>
    );
  }

  if (!detail) return null;

  const { customer, openTicket, recentTickets, histories } = detail;
  const distMeters = computeDistanceMeters(
    customer.lat,
    customer.lng,
    customer.odpLat,
    customer.odpLng,
  );
  const oltVal = customer.oltAttenuation ?? null;
  const ontVal = customer.ontAttenuation ?? customer.currentAttenuation ?? null;
  const hasCustomerCoords = typeof customer.lat === 'number' && typeof customer.lng === 'number';
  const hasOdpCoords = typeof customer.odpLat === 'number' && typeof customer.odpLng === 'number';

  const mapsHref = customer.splitterCode
    ? `/maps?odp=${encodeURIComponent(customer.splitterCode)}&sia=${encodeURIComponent(customer.siaNumber)}`
    : `/maps?sia=${encodeURIComponent(customer.siaNumber)}`;

  return (
    <main className="customer-profile-page" id="main-content">
      {/* Breadcrumb */}
      <nav className="cp-breadcrumb" aria-label="Breadcrumb">
        <Link href="/customers" className="cp-breadcrumb-link">
          <Icon name="arrowLeft" size={14} />
          <span>Pelanggan (SIA)</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span>{customer.siaNumber}</span>
      </nav>

      {/* Profile Command Header */}
      <header className="cp-header-card">
        <div className="cp-header-main">
          <div className="cp-title-row">
            <h1 className="cp-title">{customer.fullName}</h1>
            <span className="cp-sia-chip">SIA {customer.siaNumber}</span>
            <span className="customer-status-badge">
              <span
                className={`customer-status-dot ${
                  customer.status === 'ACTIVE'
                    ? 'active'
                    : customer.status === 'PENDING_INSTALL'
                      ? 'pending'
                      : customer.status === 'ISOLATED'
                        ? 'isolated'
                        : 'inactive'
                }`}
              />
              <span>
                {customer.status === 'ACTIVE'
                  ? 'Aktif'
                  : customer.status === 'PENDING_INSTALL'
                    ? 'Menunggu PSB'
                    : customer.status === 'ISOLATED'
                      ? 'Terisolir'
                      : 'Nonaktif'}
              </span>
            </span>
            {openTicket && (
              <Link
                href={`/tickets?search=${encodeURIComponent(openTicket.ticketNumber)}`}
                className="cp-tc-open-badge"
              >
                <Icon name="ticket" size={12} />
                <span>TC Open: {openTicket.ticketNumber}</span>
              </Link>
            )}
          </div>
          <div className="cp-meta-line">
            <span>
              Cluster: <b>{customer.cluster}</b> ({customer.clusterCode})
            </span>
            <span>·</span>
            <span>
              ODP: <b>{customer.splitterName || customer.splitterCode || 'Belum dipetakan'}</b>
              {customer.portNumber != null ? ` · Port #${customer.portNumber}` : ''}
            </span>
          </div>
        </div>

        <div className="cp-header-actions">
          <Link href={mapsHref} className="button secondary">
            <Icon name="map" size={14} />
            <span>Lihat di Peta ODP</span>
          </Link>
          {isSuperAdmin && (
            <button
              type="button"
              className="button primary"
              onClick={() => setEditOpen(true)}
            >
              <Icon name="edit" size={14} />
              <span>Edit Profil</span>
            </button>
          )}
        </div>
      </header>

      {/* Main 2-Column Content */}
      <div className="cp-grid">
        {/* Left Column: Building Photo, Description, Activity Note, 4 Recent Tickets, OPM History */}
        <div className="cp-column">
          {/* Building / Location Photo */}
          <section className="cp-card" aria-label="Foto Bangunan dan Lokasi Pelanggan">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="building" size={16} />
                <span>Foto Bangunan / Lokasi Pelanggan</span>
              </h2>
              {isSuperAdmin && (
                <button
                  type="button"
                  className="cp-mini-btn"
                  onClick={() => setEditOpen(true)}
                >
                  <Icon name="upload" size={12} />
                  <span>{customer.photoUrl ? 'Ganti Foto' : 'Unggah Foto'}</span>
                </button>
              )}
            </div>

            {customer.photoUrl ? (
              <>
                <div className="cp-photo-frame">
                  <img
                    src={customer.photoUrl}
                    alt={customer.photoCaption || `Foto bangunan ${customer.fullName}`}
                    className="cp-photo-img"
                    onClick={() => setLightboxOpen(true)}
                  />
                </div>
                <p className="cp-photo-caption">
                  {customer.photoCaption ||
                    `Dokumentasi lokasi / bangunan ${customer.fullName}. Klik gambar untuk memperbesar.`}
                </p>
              </>
            ) : (
              <div className="cp-photo-empty">
                <Icon name="image" size={28} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>
                    Foto bangunan atau cabang belum diunggah
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>
                    Super Admin dapat mengunggah foto tampak depan gedung/lokasi untuk memudahkan
                    identifikasi teknisi lapangan.
                  </div>
                </div>
                {isSuperAdmin && (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ marginTop: '4px' }}
                    onClick={() => setEditOpen(true)}
                  >
                    <Icon name="upload" size={13} />
                    <span>Unggah Foto Bangunan</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Customer Profile Description */}
          <section className="cp-card" aria-label="Deskripsi Profil Pelanggan">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="fileText" size={16} />
                <span>Deskripsi Profil Pelanggan</span>
              </h2>
            </div>
            {customer.profileDescription ? (
              <p className="cp-description-text">{customer.profileDescription}</p>
            ) : (
              <p className="cp-empty-note">
                Belum ada deskripsi profil khusus untuk pelanggan ini.
                {isSuperAdmin ? ' Klik "Edit Profil" untuk menambahkan deskripsi lokasi/layanan.' : ''}
              </p>
            )}
          </section>

          {/* Last Activity Note & 4 Recent Tickets */}
          <section className="cp-card" aria-label="Catatan Aktivitas dan Riwayat Tiket">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="ticket" size={16} />
                <span>Note Activity Terakhir &amp; 4 Tiket Terakhir</span>
              </h2>
              <Link
                href={`/tickets?search=${encodeURIComponent(customer.siaNumber)}`}
                className="cp-mini-btn"
              >
                <span>Semua Tiket</span>
                <Icon name="arrowRight" size={12} />
              </Link>
            </div>

            <div className="cp-kv">
              <span className="cp-kv-label">Note Activity Terakhir</span>
              <div className="cp-activity-note-box">
                {customer.lastActivityNote || customer.notes || 'Belum ada catatan aktivitas terakhir.'}
              </div>
            </div>

            <div className="cp-kv">
              <span className="cp-kv-label">
                List Tiket Terakhir ({recentTickets.length} dari maks. 4)
              </span>
              {recentTickets.length === 0 ? (
                <EmptyState
                  icon="ticket"
                  title="Belum ada tiket tercatat"
                  description="Tiket PSB maupun Maintenance untuk SIA ini akan muncul di sini."
                  size="compact"
                />
              ) : (
                <div className="cp-ticket-list">
                  {recentTickets.map((t) => {
                    const meta = ticketStatusMeta(t.status);
                    const isOpen =
                      t.status === 'OPEN' ||
                      t.status === 'IN_PROGRESS' ||
                      t.status === 'PENDING_APPROVAL';
                    return (
                      <Link
                        key={t.id}
                        href={`/tickets?search=${encodeURIComponent(t.ticketNumber)}`}
                        className={`cp-ticket-item ${isOpen ? 'is-open' : ''}`}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="cp-ticket-no">{t.ticketNumber}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {t.ticketType} ·{' '}
                              {new Date(t.createdAt).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          {t.complaintSummary && (
                            <p className="cp-ticket-summary">{t.complaintSummary}</p>
                          )}
                        </div>
                        <span className={`cp-ticket-status ${meta.cls}`}>{meta.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Attenuation History (Immutable Audit Trail) */}
          <section className="cp-card" aria-label="Riwayat Pengukuran Redaman">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="activity" size={16} />
                <span>Riwayat Pengukuran Redaman (OPM)</span>
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                10 Laporan Terakhir
              </span>
            </div>

            {histories.length === 0 ? (
              <EmptyState
                icon="activity"
                title="Belum ada riwayat ukur OPM"
                description="Riwayat redaman tercatat otomatis saat teknisi mengirim hasil ukur lapangan."
                size="compact"
              />
            ) : (
              <div className="modal-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr className="modal-table-header-row">
                      <th scope="col" style={{ padding: '8px 10px' }}>Waktu</th>
                      <th scope="col" style={{ padding: '8px 10px' }}>Redaman</th>
                      <th scope="col" style={{ padding: '8px 10px' }}>ODP &amp; Port</th>
                      <th scope="col" style={{ padding: '8px 10px' }}>Teknisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histories.map((h) => {
                      const tone = dbmTone(h.newAttenuation);
                      return (
                        <tr key={h.id || h.submissionId} className="modal-table-row">
                          <td className="modal-td-muted" style={{ padding: '8px 10px', fontSize: '11.5px' }}>
                            {new Date(h.recordedAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                            <span
                              className={
                                tone === 'green'
                                  ? 'ui-text-success-strong'
                                  : tone === 'orange'
                                    ? 'ui-text-warn'
                                    : 'ui-text-critical-strong'
                              }
                            >
                              {h.newAttenuation.toFixed(1)} dBm
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {h.splitterCode} <code>#{h.portNumber}</code>
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
          </section>
        </div>

        {/* Right Column: PIC Info, OLT/ONT Attenuation & GPON, Coordinates & ODP Location */}
        <div className="cp-column">
          {/* PIC Contact Card */}
          <section className="cp-card" aria-label="Informasi PIC Pelanggan">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="userCheck" size={16} />
                <span>Kontak PIC Pelanggan</span>
              </h2>
            </div>

            {customer.picName || customer.picPhone || customer.picRole ? (
              <>
                <div className="cp-pic-grid">
                  <div className="cp-kv">
                    <span className="cp-kv-label">Nama PIC</span>
                    <span className="cp-kv-value">{customer.picName || '-'}</span>
                  </div>
                  <div className="cp-kv">
                    <span className="cp-kv-label">Jabatan / Peran</span>
                    <span className="cp-kv-value">{customer.picRole || '-'}</span>
                  </div>
                  <div className="cp-kv">
                    <span className="cp-kv-label">Nomor Telepon / WA</span>
                    <span className="cp-kv-mono">{customer.picPhone || '-'}</span>
                  </div>
                </div>
                {customer.picPhone && (
                  <div className="cp-pic-actions">
                    <a href={`tel:${customer.picPhone.replace(/\s+/g, '')}`} className="cp-contact-btn">
                      <Icon name="phone" size={13} />
                      <span>Telepon PIC</span>
                    </a>
                    <a
                      href={`https://wa.me/${formatWaPhone(customer.picPhone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cp-contact-btn"
                    >
                      <Icon name="chat" size={13} />
                      <span>Chat WhatsApp</span>
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="cp-empty-note">
                Data PIC pelanggan belum dilengkapi.
                {isSuperAdmin ? ' Super Admin dapat menambahkan kontak PIC melalui Edit Profil.' : ''}
              </p>
            )}
          </section>

          {/* Optical Attenuation (OLT & ONT) & GPON */}
          <section className="cp-card" aria-label="Telemetri Redaman OLT dan ONT">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="zap" size={16} />
                <span>Redaman OLT / ONT &amp; Spesifikasi GPON</span>
              </h2>
            </div>

            <div className="cp-dbm-grid">
              <div className={`cp-dbm-box ${dbmStatusClass(oltVal)}`}>
                <span className="cp-kv-label">Redaman OLT</span>
                <span className="cp-dbm-number">
                  {oltVal != null ? `${oltVal.toFixed(1)} dB` : '-'}
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
                  {dbmFriendlyLabel(oltVal)}
                </span>
              </div>

              <div className={`cp-dbm-box ${dbmStatusClass(ontVal)}`}>
                <span className="cp-kv-label">Redaman ONT</span>
                <span className="cp-dbm-number">
                  {ontVal != null ? `${ontVal.toFixed(1)} dB` : '-'}
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
                  {dbmFriendlyLabel(ontVal)}
                </span>
              </div>
            </div>

            <div className="cp-dbm-scale-note">
              <span>Standar Operasional Redaman Optik</span>
              <span>
                <b>Bagus:</b> s/d 28 dB (-28.0 dBm) · <b>Jelek:</b> &gt; 28 dB (&lt; -28.0 dBm)
              </span>
            </div>

            <div className="cp-pic-grid" style={{ paddingTop: '4px' }}>
              <div className="cp-kv">
                <span className="cp-kv-label">Node GPON</span>
                <span className="cp-kv-mono">{customer.gponNode || '-'}</span>
              </div>
              <div className="cp-kv">
                <span className="cp-kv-label">Slot OLT</span>
                <span className="cp-kv-mono">{customer.oltSlot || '-'}</span>
              </div>
              <div className="cp-kv">
                <span className="cp-kv-label">SN Modem ONT</span>
                <span className="cp-kv-mono">{customer.ontSn || '-'}</span>
              </div>
            </div>
          </section>

          {/* Customer Coordinates & ODP Datek Coordinates */}
          <section className="cp-card" aria-label="Koordinat Pelanggan dan Titik Datek ODP">
            <div className="cp-card-header">
              <h2 className="cp-card-title">
                <Icon name="mapPin" size={16} />
                <span>Lokasi Pelanggan &amp; Titik Datek ODP</span>
              </h2>
              {distMeters !== null && (
                <span className="cp-sia-chip">Jarak ODP ±{distMeters} m</span>
              )}
            </div>

            <div className="cp-kv">
              <span className="cp-kv-label">Alamat Instalasi</span>
              <span className="cp-kv-value">{customer.address}</span>
            </div>

            <div className="cp-coord-row">
              <div className="cp-kv">
                <span className="cp-kv-label">LatLog Customer</span>
                <span className="cp-kv-mono">
                  {hasCustomerCoords
                    ? `${customer.lat!.toFixed(6)}, ${customer.lng!.toFixed(6)}`
                    : 'Belum diisi'}
                </span>
              </div>
              {hasCustomerCoords && (
                <div className="cp-coord-actions">
                  <button
                    type="button"
                    className="cp-mini-btn"
                    onClick={() =>
                      void copyText(
                        `${customer.lat}, ${customer.lng}`,
                        'Koordinat pelanggan',
                      )
                    }
                  >
                    <Icon name="copy" size={12} />
                    <span>Salin</span>
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-mini-btn"
                  >
                    <Icon name="externalLink" size={12} />
                    <span>Google Maps</span>
                  </a>
                </div>
              )}
            </div>

            <div className="cp-pic-grid">
              <div className="cp-kv">
                <span className="cp-kv-label">Nama ODP</span>
                <span className="cp-kv-value">
                  {customer.splitterName || customer.splitterCode || 'Belum dipetakan'}
                </span>
              </div>
              <div className="cp-kv">
                <span className="cp-kv-label">Kode &amp; Port ODP</span>
                <span className="cp-kv-mono">
                  {customer.splitterCode || '-'} · Port #{customer.portNumber ?? '-'}
                </span>
              </div>
            </div>

            <div className="cp-coord-row">
              <div className="cp-kv">
                <span className="cp-kv-label">LatLog ODP</span>
                <span className="cp-kv-mono">
                  {hasOdpCoords
                    ? `${customer.odpLat!.toFixed(6)}, ${customer.odpLng!.toFixed(6)}`
                    : 'Belum dipetakan'}
                </span>
              </div>
              {hasOdpCoords && (
                <div className="cp-coord-actions">
                  <button
                    type="button"
                    className="cp-mini-btn"
                    onClick={() =>
                      void copyText(
                        `${customer.odpLat}, ${customer.odpLng}`,
                        'Koordinat ODP',
                      )
                    }
                  >
                    <Icon name="copy" size={12} />
                    <span>Salin</span>
                  </button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${customer.odpLat},${customer.odpLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-mini-btn"
                  >
                    <Icon name="navigation" size={12} />
                    <span>Rute GMaps</span>
                  </a>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Super Admin Profile Edit Modal */}
      {isSuperAdmin && (
        <CustomerProfileEditModal
          customer={customer}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            await loadProfile();
          }}
        />
      )}

      {/* Fullscreen Photo Lightbox */}
      {lightboxOpen && customer.photoUrl && (
        <div
          className="cp-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau foto lokasi ${customer.fullName}`}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="cp-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="cp-lightbox-bar">
              <span>
                <b>{customer.fullName}</b>
                {customer.photoCaption ? ` · ${customer.photoCaption}` : ''}
              </span>
              <button
                type="button"
                className="button secondary"
                onClick={() => setLightboxOpen(false)}
              >
                Tutup
              </button>
            </div>
            <img
              src={customer.photoUrl}
              alt={customer.photoCaption || `Foto lokasi ${customer.fullName}`}
              className="cp-lightbox-img"
            />
          </div>
        </div>
      )}
    </main>
  );
}
