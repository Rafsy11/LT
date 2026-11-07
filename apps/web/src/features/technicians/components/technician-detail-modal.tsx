'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { TechnicianListItem } from '@repo/shared';

interface TechnicianDetailModalProps {
  technician: TechnicianListItem | null;
  onClose: () => void;
  onForceLogout: (usernameOrId: string) => void;
  onToggleAccount: (usernameOrId: string) => void;
  canManageTech: boolean;
  isProcessing: boolean;
}

export function TechnicianDetailModal({
  technician,
  onClose,
  onForceLogout,
  onToggleAccount,
  canManageTech,
  isProcessing,
}: TechnicianDetailModalProps) {
  if (!technician) return null;

  const isActiveSession = technician.sessionStatus === 'ACTIVE_SESSION';
  const isRevokedSession = technician.sessionStatus === 'REVOKED';

  return (
    <dialog className="overlay" open onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="technician-modal-title">
      <article
        className="modal"
        style={{ maxWidth: '760px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="panel-heading"
          style={{ padding: '16px 20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <DefaultAvatar size={44} name={technician.fullName} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 id="technician-modal-title" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                  {technician.fullName}
                </h2>
                <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                  @{technician.username}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                Cluster Penugasan: <b>{technician.cluster}</b>
              </p>
            </div>
          </div>
          <button className="dots" onClick={onClose} aria-label="Tutup modal" type="button">
            ×
          </button>
        </header>

        <div className="modal-body" style={{ padding: '20px' }}>
          {/* Security Status Banner */}
          {technician.isMockLocationDetected && (
            <div className="technician-banner mock-location">
              <Icon name="alert" size={16} />
              <div>
                <b>Peringatan Integritas Lapangan (Anti-Fake GPS):</b>
                <div>
                  Perangkat terdeteksi menyalakan modul Mock Location (
                  <code>location.mocked = true</code>). Berdasarkan PRD 3.3, pengiriman tiket
                  otomatis ditangguhkan hingga GPS terverifikasi sah.
                </div>
              </div>
            </div>
          )}

          {isActiveSession && (
            <div className="technician-banner active-session">
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#16a34a',
                  display: 'inline-block',
                }}
              />
              <div>
                <b>Sesi Mobile Aktif:</b> Perangkat terikat secara sah ke Redis Session Store &
                PostgreSQL. Akses ke API mobile diizinkan.
              </div>
            </div>
          )}

          {isRevokedSession && (
            <div className="technician-banner revoked-session">
              <Icon name="lock" size={16} />
              <div>
                <b>Sesi Dicabut (Force Logout):</b> Token akses JWT perangkat telah dibatalkan di
                Redis. Aplikasi mobile akan meminta autentikasi ulang.
              </div>
            </div>
          )}

          {/* Hardware & Device Binding Grid */}
          <div style={{ marginBottom: '18px' }}>
            <div
              className="modal-section-title"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
              }}
            >
              Spesifikasi Perangkat Terikat (Device Binding)
            </div>
            <div className="modal-two-col-grid">
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Model Perangkat & OS
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                  {technician.deviceModel || 'Belum terikat'}
                </span>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Versi Aplikasi Mobile
                </span>
                <code className="modal-code-chip">
                  {technician.appVersion || 'v1.0.0'}
                </code>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Unique Device ID (UUID)
                </span>
                <code className="modal-code-chip">
                  {technician.deviceId || 'DEV-UNBOUND'}
                </code>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Nomor Telepon Operasional
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 500 }}>
                  {technician.phoneNumber || '+62 8xx-xxxx-xxxx'}
                </span>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Status Sesi Redis / PostgreSQL
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: isActiveSession ? '#166534' : isRevokedSession ? '#991b1b' : '#64748b',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isActiveSession
                        ? '#16a34a'
                        : isRevokedSession
                          ? '#dc2626'
                          : '#94a3b8',
                    }}
                  />
                  {isActiveSession
                    ? 'Sesi Aktif (Sah)'
                    : isRevokedSession
                      ? 'Dicabut (Revoked)'
                      : 'Tidak Ada Sesi'}
                </span>
              </div>

              <div>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  Aktivitas Terakhir
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {technician.lastActiveAt || 'Belum ada aktivitas'}
                </span>
              </div>
            </div>
          </div>

          {/* Active Work Orders Strip */}
          <div style={{ marginBottom: '18px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Tiket Penugasan Aktif Lapangan ({technician.activeTicketsCount})</span>
              <span style={{ textTransform: 'none', fontWeight: 400, color: '#94a3b8' }}>
                Total Selesai: {technician.completedTicketsCount} Tiket
              </span>
            </div>

            {technician.activeWorkOrders && technician.activeWorkOrders.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {technician.activeWorkOrders.map((wo) => (
                  <div
                    key={wo.ticketNumber}
                    className="modal-sub-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            fontSize: '12px',
                          }}
                        >
                          {wo.ticketNumber}
                        </span>
                        <span className="modal-code-chip" style={{ fontSize: '10.5px' }}>
                          {wo.ticketType}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          marginTop: '2px',
                        }}
                      >
                        Pelanggan: {wo.customerName}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          display: 'block',
                          fontFamily: 'monospace',
                        }}
                      >
                        {wo.splitterCode || 'ODP Target'}
                      </span>
                      <Link
                        href={`/tickets?search=${wo.ticketNumber}`}
                        className="action-detail-link"
                        onClick={onClose}
                      >
                        Lihat Tiket →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="modal-empty-box">
                Tidak ada tiket aktif yang sedang dipegang oleh teknisi ini saat ini.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <footer className="modal-footer">
          <div role="group" aria-label="Aksi kontrol sesi teknisi" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {canManageTech ? (
              <>
                {isActiveSession ? (
                  <button
                    className="button modal-danger-btn"
                    disabled={isProcessing}
                    onClick={() => onForceLogout(technician.username)}
                  >
                    <Icon name="logOut" size={13} />
                    {isProcessing ? 'Memproses...' : 'Cabut Sesi (Force Logout)'}
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: '#94a3b8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Icon name="check" size={13} /> Sesi Tidak Aktif
                  </span>
                )}

                <button
                  className="button"
                  disabled={isProcessing}
                  onClick={() => onToggleAccount(technician.username)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '7px 12px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Icon name={technician.isActive ? 'lock' : 'unlock'} size={14} />
                  {technician.isActive ? 'Kunci Akun' : 'Buka Kunci Akun'}
                </button>
              </>
            ) : (
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                🔒 Mode Lihat Saja (Izin <code>tech:manage</code> diperlukan)
              </span>
            )}
          </div>

          <button
            className="button primary"
            onClick={onClose}
            type="button"
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </footer>
      </article>
    </dialog>
  );
}
