'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { classifyDbm, dbmTone, PERMISSIONS, type CustomerListItem } from '@repo/shared';
import { useAuth, useToast } from '@/providers';
import '@/styles/components/customer-modal.css';

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
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  const canEditCustomer = hasPermission(PERMISSIONS.CUSTOMER_UPDATE);

  const [histories, setHistories] = useState<AttenuationHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('ACTIVE');
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    if (customer?.status) {
      setSelectedStatus(customer.status);
    }
  }, [customer?.status, customer?.siaNumber]);

  useEffect(() => {
    if (!customer?.siaNumber) return;

    setLoadingHistory(true);
    fetch(`/api/v1/admin/customers?sia=${encodeURIComponent(customer.siaNumber)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.histories) {
          setHistories(json.data.histories);
        }
      })
      .catch((err) => console.error('Gagal mengambil riwayat redaman:', err))
      .finally(() => setLoadingHistory(false));
  }, [customer?.siaNumber]);

  if (!customer) return null;

  const tone = dbmTone(customer.currentAttenuation);

  return (
    <ModalOverlay onClose={onClose} labelledBy="customer-detail-title">
      <article
        className="modal"
        style={{
          maxWidth: '760px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="panel-heading"
          style={{ padding: '16px 20px', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="modal-icon-wrap">
              <Icon name="users" size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 id="customer-detail-title" className="modal-heading">
                  {customer.fullName}
                </h2>
                <span className="modal-badge-mono">
                  {customer.siaNumber}
                </span>
              </div>
              <p className="modal-subheading">
                Cluster: <b>{customer.cluster}</b> ({customer.clusterCode})
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
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Service Status & Physical Binding Strip */}
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
                Status Layanan
              </div>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                Alokasi Splitter &amp; Port
              </div>
              <div
                style={{ marginTop: '4px', fontSize: '12px', fontWeight: 600 }}
              >
                {customer.splitterCode}{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  Port #{customer.portNumber}
                </span>
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
                Redaman Optik Terakhir
              </div>
              <div
                style={{
                  marginTop: '4px',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                {customer.currentAttenuation.toFixed(1)} dBm{' '}
                <span style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                  ({classifyDbm(customer.currentAttenuation)})
                </span>
              </div>
            </div>
          </div>

          {/* Alamat & Catatan Lokasi */}
          <div className="modal-sub-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
                fontWeight: 600,
              }}
            >
              <Icon name="pin" size={13} />
              <span>Detail Wilayah &amp; Alamat Instalasi</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>Alamat Lengkap: </span>
              {customer.address}
            </div>
            {(customer.kecamatan || customer.kelurahan || customer.street) && (
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  marginTop: '6px',
                  fontSize: '11.5px',
                  flexWrap: 'wrap',
                }}
              >
                {customer.street && (
                  <span>
                    <b>Jalan:</b> {customer.street}
                  </span>
                )}
                {customer.kelurahan && (
                  <span>
                    <b>Kelurahan:</b> {customer.kelurahan}
                  </span>
                )}
                {customer.kecamatan && (
                  <span>
                    <b>Kecamatan:</b> {customer.kecamatan}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Attenuation History Section (Append-Only per PRD 5.1 & Law 2) */}
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
                Immutable Audit Trail (PRD 5.1)
              </span>
            </div>

            {loadingHistory ? (
              <div
                style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}
              >
                Memuat riwayat redaman...
              </div>
            ) : histories.length === 0 ? (
              <div className="modal-empty-box">
                Belum ada data pengukuran redaman yang tercatat di{' '}
                <code>attenuation_histories</code>.
              </div>
            ) : (
              <div className="modal-table-wrap">
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '11.5px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr className="modal-table-header-row">
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Waktu Pencatatan</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Nilai Redaman</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Splitter & Port</th>
                      <th scope="col" style={{ padding: '8px 10px', fontWeight: 600 }}>Teknisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histories.map((h) => {
                      const histTone = dbmTone(h.newAttenuation);
                      return (
                        <tr
                          key={h.id || h.submissionId}
                          className="modal-table-row"
                        >
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
                              style={{
                                fontWeight: 600,
                                color:
                                  histTone === 'green'
                                    ? '#166534'
                                    : histTone === 'orange'
                                      ? '#b45309'
                                      : '#be123c',
                              }}
                            >
                              {h.newAttenuation.toFixed(1)} dBm
                            </span>
                            {h.oldAttenuation !== null && (
                              <span
                                style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}
                              >
                                (sebelumnya: {h.oldAttenuation.toFixed(1)})
                              </span>
                            )}
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

        {/* Service Status Governance Bar */}
        {canEditCustomer && (
          <div className="customer-status-governance-bar">
            <div className="customer-status-governance-label">
              Ubah Status Layanan SIA
            </div>
            <div className="customer-status-governance-controls">
              <select
                aria-label="Status layanan pelanggan"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="customer-status-select"
              >
                <option value="ACTIVE">ACTIVE (Aktif)</option>
                <option value="PENDING_INSTALL">PENDING_INSTALL (Menunggu PSB)</option>
                <option value="ISOLATED">ISOLATED (Isolir)</option>
                <option value="DISMANTLED">DISMANTLED (Putus / Dismantle)</option>
              </select>
              <button
                type="button"
                className="button secondary"
                disabled={savingStatus || selectedStatus === customer.status}
                onClick={async () => {
                  try {
                    setSavingStatus(true);
                    const res = await fetch('/api/v1/admin/customers', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        siaNumber: customer.siaNumber,
                        status: selectedStatus,
                      }),
                    });
                    const json = (await res.json()) as {
                      success?: boolean;
                      error?: { message?: string };
                    };
                    if (!res.ok || !json.success) {
                      throw new Error(json.error?.message || 'Gagal memperbarui status pelanggan');
                    }
                    showSuccess(`Status layanan ${customer.siaNumber} diperbarui ke ${selectedStatus}.`);
                    await onUpdated?.();
                  } catch (err: unknown) {
                    showError(
                      err instanceof Error ? err.message : 'Gagal memperbarui status pelanggan',
                    );
                  } finally {
                    setSavingStatus(false);
                  }
                }}
              >
                {savingStatus ? 'Menyimpan...' : 'Simpan Status'}
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer Links */}
        <footer className="modal-footer">
          <div role="group" aria-label="Aksi rincian pelanggan" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link
              href={`/tickets?search=${encodeURIComponent(customer.siaNumber)}`}
              className="modal-footer-link"
            >
              <Icon name="ticket" size={13} />
              Lihat Tiket Terkait
            </Link>
            <span className="modal-footer-sep">·</span>
            <Link
              href={`/monitoring?search=${encodeURIComponent(customer.siaNumber)}`}
              className="modal-footer-link"
            >
              <Icon name="activity" size={13} />
              Pantau di Live Stream
            </Link>
          </div>

          <button
            onClick={onClose}
            className="button"
            type="button"
          >
            Tutup
          </button>
        </footer>
      </article>
    </ModalOverlay>
  );
}
