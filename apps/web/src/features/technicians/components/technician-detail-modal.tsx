'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { TechnicianListItem } from '@repo/shared';
import {
  resolveTechnicianVisualState,
  type TechnicianModalIntent,
} from '../utils/technician-session';

const COPY_FEEDBACK_DURATION_MS = 1800;
const MAX_ACTION_REASON_LENGTH = 160;

type ConfirmActionType = Exclude<TechnicianModalIntent, 'inspect'>;

export interface TechnicianDetailModalProps {
  technician: TechnicianListItem | null;
  initialIntent?: TechnicianModalIntent;
  onClose: () => void;
  onForceLogout: (usernameOrId: string, reason?: string) => Promise<boolean>;
  onToggleAccount: (usernameOrId: string, reason?: string) => Promise<boolean>;
  canManageTech: boolean;
  isProcessing: boolean;
}

export function TechnicianDetailModal({
  technician,
  initialIntent = 'inspect',
  onClose,
  onForceLogout,
  onToggleAccount,
  canManageTech,
  isProcessing,
}: TechnicianDetailModalProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [copiedField, setCopiedField] = useState<'nik' | 'deviceId' | null>(null);

  const cancelConfirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const techKey = technician?.id || technician?.username || '';
  const techIsActive = technician?.isActive ?? false;
  const techSessionStatus = technician?.sessionStatus;

  // Sync confirmation panel when modal opens with a direct quick-action intent
  useEffect(() => {
    if (!technician) return;
    setActionReason('');
    if (!canManageTech || initialIntent === 'inspect') {
      setConfirmAction(null);
      return;
    }
    if (
      initialIntent === 'force_logout' &&
      techIsActive &&
      techSessionStatus === 'ACTIVE_SESSION'
    ) {
      setConfirmAction('force_logout');
      return;
    }
    if (initialIntent === 'lock_account' && techIsActive) {
      setConfirmAction('lock_account');
      return;
    }
    if (initialIntent === 'unlock_account' && !techIsActive) {
      setConfirmAction('unlock_account');
      return;
    }
    setConfirmAction(null);
  }, [technician, techKey, initialIntent, canManageTech, techIsActive, techSessionStatus]);

  // Move focus to the safe "Batal" control whenever a confirmation panel opens
  useEffect(() => {
    if (confirmAction) {
      cancelConfirmBtnRef.current?.focus();
    }
  }, [confirmAction]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  if (!technician) return null;

  const visual = resolveTechnicianVisualState(technician);
  const isActiveSession = technician.isActive && technician.sessionStatus === 'ACTIVE_SESSION';

  const handleCopyValue = async (field: 'nik' | 'deviceId', value: string) => {
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    setCopiedField(field);
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopiedField(null);
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const handleExecuteConfirm = async () => {
    if (!confirmAction || isProcessing) return;
    const trimmedReason = actionReason.trim() || undefined;
    let succeeded = false;

    if (confirmAction === 'force_logout') {
      succeeded = await onForceLogout(technician.username, trimmedReason);
    } else {
      succeeded = await onToggleAccount(technician.username, trimmedReason);
    }

    if (succeeded) {
      setConfirmAction(null);
      setActionReason('');
    }
  };

  const confirmCopy =
    confirmAction === 'force_logout'
      ? {
          title: `Cabut sesi perangkat @${technician.username}?`,
          description:
            'Sesi aktif pada perangkat mobile akan langsung dihentikan. Teknisi wajib masuk ulang untuk melanjutkan pengiriman laporan.',
          placeholder: 'Contoh: Perangkat hilang, pergantian shift, atau anomali GPS',
          ctaLabel: 'Ya, Cabut Sesi',
          tone: 'danger' as const,
        }
      : confirmAction === 'lock_account'
        ? {
            title: `Kunci akun teknisi @${technician.username}?`,
            description:
              'Akun akan dinonaktifkan dan seluruh sesi mobile aktif akan dicabut seketika hingga dibuka kembali oleh admin.',
            placeholder: 'Contoh: Kontrak vendor berakhir atau pelanggaran SOP',
            ctaLabel: 'Ya, Kunci Akun',
            tone: 'danger' as const,
          }
        : {
            title: `Aktifkan kembali akun @${technician.username}?`,
            description:
              'Teknisi akan kembali diizinkan masuk melalui aplikasi mobile dan menerima penugasan tiket.',
            placeholder: 'Contoh: Verifikasi ulang selesai atau penugasan aktif kembali',
            ctaLabel: 'Ya, Aktifkan Akun',
            tone: 'primary' as const,
          };

  return (
    <ModalOverlay
      onClose={onClose}
      labelledBy="technician-modal-title"
      className="tech-modal-overlay"
    >
      <article
        className="modal tech-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="tech-modal-header">
          <div className="tech-modal-header-identity">
            <DefaultAvatar size={44} name={technician.fullName} />
            <div className="tech-modal-header-copy">
              <div className="tech-modal-title-row">
                <h2 id="technician-modal-title" className="tech-modal-title">
                  {technician.fullName}
                </h2>
                <span className={`tech-session-badge tech-session-badge--${visual.state}`}>
                  {visual.state === 'locked' && <Icon name="lock" size={11} />}
                  {visual.state === 'active' && (
                    <span className="tech-session-dot" aria-hidden="true" />
                  )}
                  <span>{visual.badgeLabel}</span>
                </span>
              </div>
              <p className="tech-modal-subtitle">
                <span className="tech-modal-username">@{technician.username}</span>
                <span aria-hidden="true">·</span>
                <span>Cluster {technician.cluster || 'Belum ditentukan'}</span>
                {technician.vendorCompany && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{technician.vendorCompany}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            className="tech-modal-close-btn"
            onClick={onClose}
            aria-label="Tutup detail sesi teknisi"
            type="button"
          >
            <Icon name="x" size={17} />
          </button>
        </header>

        {/* Scrollable Modal Body */}
        <div className="modal-body tech-modal-body">
          {/* Security & Session Status Banners */}
          {technician.isMockLocationDetected && (
            <div className="technician-banner technician-banner--alert" role="alert">
              <Icon name="alert" size={16} className="technician-banner-icon" />
              <div className="technician-banner-copy">
                <strong>Peringatan Integritas Lokasi (Mock GPS)</strong>
                <p>
                  Perangkat terdeteksi menggunakan lokasi palsu. Pengiriman laporan lapangan
                  ditangguhkan hingga koordinat GPS perangkat kembali valid.
                </p>
              </div>
            </div>
          )}

          <div className={`technician-banner technician-banner--${visual.state}`}>
            <span className="technician-banner-icon" aria-hidden="true">
              {visual.state === 'active' ? (
                <Icon name="checkCircle" size={16} />
              ) : visual.state === 'locked' || visual.state === 'revoked' ? (
                <Icon name="lock" size={16} />
              ) : (
                <Icon name="info" size={16} />
              )}
            </span>
            <div className="technician-banner-copy">
              <strong>{visual.bannerTitle}</strong>
              <p>{visual.bannerDescription}</p>
            </div>
          </div>

          {/* Section 1: Identity & Partner Info */}
          <section className="tech-modal-section" aria-labelledby="tech-modal-identity-label">
            <h3 id="tech-modal-identity-label" className="tech-modal-section-title">
              Identitas &amp; Kemitraan
            </h3>
            <dl className="tech-modal-spec-grid">
              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">NIK Teknisi</dt>
                <dd className="tech-modal-spec-val tech-modal-spec-val--copyable">
                  {technician.nik ? (
                    <>
                      <code className="tech-code-chip">{technician.nik}</code>
                      <button
                        type="button"
                        className="tech-copy-btn"
                        onClick={() => void handleCopyValue('nik', technician.nik!)}
                        aria-label="Salin NIK teknisi"
                      >
                        <Icon name={copiedField === 'nik' ? 'check' : 'copy'} size={12} />
                        <span>{copiedField === 'nik' ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    </>
                  ) : (
                    <span className="tech-muted-val">Belum tercatat</span>
                  )}
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Perusahaan Mitra / Vendor</dt>
                <dd className="tech-modal-spec-val">
                  {technician.vendorCompany || (
                    <span className="tech-muted-val">Belum tercatat</span>
                  )}
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Nomor Telepon</dt>
                <dd className="tech-modal-spec-val">
                  {technician.phoneNumber ? (
                    <span className="tech-mono-val">{technician.phoneNumber}</span>
                  ) : (
                    <span className="tech-muted-val">Belum tercatat</span>
                  )}
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Bot Telegram</dt>
                <dd className="tech-modal-spec-val">
                  {technician.telegramBound ? (
                    <span className="tech-inline-status tech-inline-status--ok">
                      <Icon name="check" size={13} />
                      <span>Terhubung</span>
                    </span>
                  ) : (
                    <span className="tech-muted-val">Belum terhubung</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Section 2: Bound Device & Session Telemetry */}
          <section className="tech-modal-section" aria-labelledby="tech-modal-device-label">
            <h3 id="tech-modal-device-label" className="tech-modal-section-title">
              Sesi &amp; Perangkat Terikat
            </h3>
            <dl className="tech-modal-spec-grid">
              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Model Perangkat &amp; OS</dt>
                <dd className="tech-modal-spec-val">
                  {technician.deviceModel || <span className="tech-muted-val">Belum terikat</span>}
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Versi Aplikasi Mobile</dt>
                <dd className="tech-modal-spec-val">
                  {technician.appVersion ? (
                    <code className="tech-code-chip">{technician.appVersion}</code>
                  ) : (
                    <span className="tech-muted-val">Belum tercatat</span>
                  )}
                </dd>
              </div>

              <div className="tech-modal-spec-item tech-modal-spec-item--full">
                <dt className="tech-modal-spec-key">ID Perangkat Terikat (Device ID)</dt>
                <dd className="tech-modal-spec-val tech-modal-spec-val--copyable">
                  {technician.deviceId ? (
                    <>
                      <code className="tech-code-chip tech-code-chip--wrap">
                        {technician.deviceId}
                      </code>
                      <button
                        type="button"
                        className="tech-copy-btn"
                        onClick={() => void handleCopyValue('deviceId', technician.deviceId!)}
                        aria-label="Salin ID perangkat teknisi"
                      >
                        <Icon name={copiedField === 'deviceId' ? 'check' : 'copy'} size={12} />
                        <span>{copiedField === 'deviceId' ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    </>
                  ) : (
                    <span className="tech-muted-val">Belum terikat</span>
                  )}
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Status Sesi</dt>
                <dd className="tech-modal-spec-val">
                  <span className={`tech-inline-status tech-inline-status--${visual.state}`}>
                    <span className={`tech-status-dot tech-status-dot--${visual.state}`} aria-hidden="true" />
                    <span>{visual.sessionLabel}</span>
                  </span>
                </dd>
              </div>

              <div className="tech-modal-spec-item">
                <dt className="tech-modal-spec-key">Aktivitas Terakhir</dt>
                <dd className="tech-modal-spec-val">
                  {technician.lastActiveAt || (
                    <span className="tech-muted-val">Belum ada aktivitas</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Section 3: Active Field Work Orders */}
          <section className="tech-modal-section" aria-labelledby="tech-modal-wo-label">
            <div className="tech-modal-section-head">
              <h3 id="tech-modal-wo-label" className="tech-modal-section-title">
                Tiket Penugasan Aktif ({technician.activeTicketsCount})
              </h3>
              <span className="tech-modal-section-meta">
                Total selesai: <strong>{technician.completedTicketsCount}</strong> tiket
              </span>
            </div>

            {technician.activeWorkOrders && technician.activeWorkOrders.length > 0 ? (
              <ul className="tech-wo-list">
                {technician.activeWorkOrders.map((wo) => (
                  <li key={wo.ticketNumber} className="tech-wo-card">
                    <div className="tech-wo-main">
                      <div className="tech-wo-top">
                        <code className="tech-wo-number">{wo.ticketNumber}</code>
                        <span className="tech-wo-type">{wo.ticketType}</span>
                      </div>
                      <div className="tech-wo-customer">{wo.customerName}</div>
                    </div>

                    <div className="tech-wo-side">
                      <span className="tech-wo-odp">
                        {wo.splitterCode || 'ODP belum ditautkan'}
                      </span>
                      <Link
                        href={`/tickets?search=${encodeURIComponent(wo.ticketNumber)}`}
                        className="tech-wo-link"
                        onClick={onClose}
                      >
                        Buka Tiket
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="tech-modal-empty">
                Tidak ada tiket aktif yang sedang dipegang teknisi ini saat ini.
              </div>
            )}
          </section>

          {/* Inline 2-Step Confirmation Zone (Predictable Layout, Safe Focus on Batal) */}
          {confirmAction && canManageTech && (
            <section
              className={`tech-confirm-panel tech-confirm-panel--${confirmCopy.tone}`}
              aria-labelledby="tech-confirm-title"
              aria-describedby="tech-confirm-desc"
            >
              <div className="tech-confirm-head">
                <Icon
                  name={confirmCopy.tone === 'danger' ? 'alert' : 'unlock'}
                  size={16}
                />
                <h3 id="tech-confirm-title" className="tech-confirm-title">
                  {confirmCopy.title}
                </h3>
              </div>

              <p id="tech-confirm-desc" className="tech-confirm-desc">
                {confirmCopy.description}
              </p>

              <div className="tech-confirm-field">
                <label htmlFor="tech-action-reason" className="tech-confirm-label">
                  Alasan tindakan (opsional, dicatat pada log aktivitas)
                </label>
                <input
                  id="tech-action-reason"
                  type="text"
                  className="tech-confirm-input"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  maxLength={MAX_ACTION_REASON_LENGTH}
                  placeholder={confirmCopy.placeholder}
                  disabled={isProcessing}
                />
              </div>

              <div className="tech-confirm-actions">
                <button
                  ref={cancelConfirmBtnRef}
                  type="button"
                  className="tech-btn-secondary"
                  onClick={() => {
                    setConfirmAction(null);
                    setActionReason('');
                  }}
                  disabled={isProcessing}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className={
                    confirmCopy.tone === 'danger'
                      ? 'tech-btn-danger-solid'
                      : 'tech-btn-primary'
                  }
                  onClick={() => void handleExecuteConfirm()}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Memproses...' : confirmCopy.ctaLabel}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Sticky Modal Footer */}
        <footer className="modal-footer tech-modal-footer">
          <div className="tech-modal-footer-actions" role="group" aria-label="Kontrol akun dan sesi">
            {canManageTech ? (
              <>
                {isActiveSession && (
                  <button
                    type="button"
                    className="tech-btn-danger-outline"
                    disabled={isProcessing || confirmAction === 'force_logout'}
                    onClick={() => setConfirmAction('force_logout')}
                  >
                    <Icon name="logOut" size={14} />
                    <span>Cabut Sesi</span>
                  </button>
                )}

                <button
                  type="button"
                  className="tech-btn-secondary"
                  disabled={
                    isProcessing ||
                    confirmAction === 'lock_account' ||
                    confirmAction === 'unlock_account'
                  }
                  onClick={() =>
                    setConfirmAction(technician.isActive ? 'lock_account' : 'unlock_account')
                  }
                >
                  <Icon name={technician.isActive ? 'lock' : 'unlock'} size={14} />
                  <span>{technician.isActive ? 'Kunci Akun' : 'Buka Kunci Akun'}</span>
                </button>
              </>
            ) : (
              <span className="tech-readonly-note">
                <Icon name="lock" size={13} />
                <span>Mode peninjauan: akun Anda hanya dapat melihat detail sesi.</span>
              </span>
            )}
          </div>

          <button className="tech-btn-primary" onClick={onClose} type="button">
            Tutup
          </button>
        </footer>
      </article>
    </ModalOverlay>
  );
}
