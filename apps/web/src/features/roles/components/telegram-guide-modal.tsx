'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { UserAccessItem } from '../hooks/use-roles';

export interface TelegramGuideModalProps {
  user: UserAccessItem | null;
  onClose: () => void;
  onUnlink?: (user: UserAccessItem) => void;
}

export function TelegramGuideModal({ user, onClose, onUnlink }: TelegramGuideModalProps) {
  const [copied, setCopied] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  if (!user) return null;

  const botHandle = '@FiberOpsNOCBot';
  const botUrl = 'https://t.me/FiberOpsNOCBot';

  const instructionText = `Halo ${user.name},
Untuk mengaktifkan OTP 2FA akun FiberOps Anda:
1. Buka Telegram lalu cari ${botHandle} (atau klik ${botUrl})
2. Ketik /start
3. Masukkan NIK resmi Anda: ${user.nik || '-'}
Akun Anda akan langsung terverifikasi untuk menerima kode OTP login resmi FiberOps Lintasarta.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(instructionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = instructionText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExecuteUnlink = () => {
    if (onUnlink) {
      onUnlink(user);
    }
    setConfirmUnlink(false);
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="telegram-guide-title">
      <article
        className="modal"
        style={{
          width: '100%',
          maxWidth: '500px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="ui-telegram-chip"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="bot" size={16} />
            </span>
            <h3
              id="telegram-guide-title"
              style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'inherit' }}
            >
              Aktivasi 2FA Telegram (NIK)
            </h3>
          </div>
          <button
            type="button"
            className="dots"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="modal-body">
          {/* User Identity Header Card */}
          <section
            aria-label="Target Operator"
            className="modal-sub-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <DefaultAvatar size={34} name={user.name} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{user.name}</div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '2px',
                  }}
                >
                  <span className="role-user-nik-badge">NIK: {user.nik || 'Belum ada'}</span>
                  <span>•</span>
                  <span>{user.role}</span>
                </div>
              </div>
            </div>

            <div>
              {user.telegramChatId ? (
                <span className="telegram-status-badge connected">Terhubung</span>
              ) : (
                <span className="telegram-status-badge pending">Menunggu NIK</span>
              )}
            </div>
          </section>

          {/* Status Content */}
          {user.telegramChatId ? (
            <section
              className="telegram-connected-box ui-alert-banner ui-alert-banner--success"
              style={{
                padding: '14px',
                borderRadius: '8px',
                marginBottom: confirmUnlink ? '16px' : '0',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="check" size={14} />
                Telegram 2FA Sudah Aktif
              </div>
              <p className="ui-alert-banner-sub" style={{ margin: '6px 0 0', fontSize: '11.5px', lineHeight: 1.5 }}>
                Chat ID: <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{user.telegramChatId}</code>.
                Kode OTP login resmi akan selalu dikirimkan ke akun Telegram ini. Jika karyawan mengganti akun Telegram, Anda dapat melepas ikatan di bawah.
              </p>
            </section>
          ) : (
            <div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Karyawan cukup mengirimkan NIK miliknya ke bot Telegram untuk verifikasi otomatis. Salin pesan instruksi berikut untuk dikirimkan via WhatsApp atau email internal:
              </p>

              <div
                className="telegram-instruction-box ui-surface-subtle"
                style={{
                  position: 'relative',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-body)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {instructionText}
              </div>
            </div>
          )}

          {/* Unlink Confirmation Panel */}
          {confirmUnlink && (
            <div
              className="ui-alert-banner ui-alert-banner--error"
              style={{
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Lepas ikatan Telegram 2FA {user.name}?
              </div>
              <div className="ui-alert-banner-sub" style={{ fontSize: '11px', marginBottom: '10px' }}>
                Karyawan tidak akan menerima OTP sampai mendaftarkan kembali NIK melalui bot Telegram.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="button outline"
                  onClick={() => setConfirmUnlink(false)}
                  style={{ padding: '4px 10px', fontSize: '11.5px' }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteUnlink}
                  className="button ui-btn-solid-danger"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Ya, Lepas Ikatan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <footer className="modal-footer" style={{ gap: '8px' }}>
          <div>
            {user.telegramChatId && !confirmUnlink && onUnlink && (
              <button
                type="button"
                onClick={() => setConfirmUnlink(true)}
                className="button ui-btn-outline-danger"
                style={{
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Putus Ikatan 2FA
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!user.telegramChatId && (
              <button
                type="button"
                onClick={handleCopy}
                className={`button ${copied ? 'ui-btn-solid-success' : 'primary ui-btn-solid-primary'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Icon name={copied ? 'check' : 'fileText'} size={14} />
                <span>{copied ? 'Tersalin!' : 'Salin Instruksi'}</span>
              </button>
            )}

            <button
              type="button"
              className="button outline"
              onClick={onClose}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Tutup
            </button>
          </div>
        </footer>
      </article>
    </ModalOverlay>
  );
}

