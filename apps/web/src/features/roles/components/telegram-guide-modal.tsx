'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
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
    <dialog
      className="overlay"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-guide-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 999,
        padding: '16px',
        border: 'none',
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      }}
      onClick={onClose}
    >
      <article
        className="modal"
        style={{
          borderRadius: '10px',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: '#f0f7ff',
                color: '#0e5b92',
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
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </header>

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
            className="telegram-connected-box"
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              marginBottom: '18px',
              fontSize: '12px',
              color: 'var(--color-success-text, #15803d)',
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="check" size={14} />
              Telegram 2FA Sudah Aktif
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--color-success-text, #166534)', lineHeight: 1.5 }}>
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
              className="telegram-instruction-box"
              style={{
                position: 'relative',
                background: 'var(--color-surface, #f8fafc)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '11.5px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-body)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
                marginBottom: '16px',
              }}
            >
              {instructionText}
            </div>
          </div>
        )}

        {/* Unlink Confirmation Panel */}
        {confirmUnlink && (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'var(--color-critical-bg, #fef2f2)',
              border: '1px solid var(--color-critical-border, #fecaca)',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-critical-text, #991b1b)', marginBottom: '6px' }}>
              Lepas ikatan Telegram 2FA {user.name}?
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-critical-text, #7f1d1d)', marginBottom: '10px' }}>
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
                style={{
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Ya, Lepas Ikatan
              </button>
            </div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            paddingTop: '14px',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <div>
            {user.telegramChatId && !confirmUnlink && onUnlink && (
              <button
                type="button"
                onClick={() => setConfirmUnlink(true)}
                style={{
                  background: 'none',
                  border: '1px solid #fca5a5',
                  color: '#dc2626',
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
                className="button primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: copied ? '#16a34a' : '#0e5b92',
                  color: '#ffffff',
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
    </dialog>
  );
}

