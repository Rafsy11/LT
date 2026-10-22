'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DraftActionCardData, sanitizeUiErrorMessage, ERROR_CODES } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { webApiClient, ApiClientError } from '@/lib/api-client';

export type DraftCardState =
  | 'PENDING'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED_REPLAY_BLOCKED';

export interface DraftActionCardProps {
  draft: DraftActionCardData;
  onExecutedSuccess?: () => void;
  formatPayloadEntry?: (key: string, val: unknown) => { label: string; value: string };
}

const defaultFormatPayloadEntry = (key: string, val: unknown) => {
  const keyLabels: Record<string, string> = {
    ticketType: 'Tipe Tiket',
    customerName: 'Nama Pelanggan',
    siaNumber: 'Nomor SIA',
    clusterCode: 'Wilayah Cluster',
    assignedTechUsername: 'Teknisi Ditugaskan',
    adminNotes: 'Instruksi Kerja',
    techUsername: 'Username Teknisi',
    techId: 'ID Teknisi',
    setActive: 'Status Akun Baru',
    reason: 'Alasan Perubahan',
    newSplitterCode: 'ODP Splitter Baru',
    newPortNumber: 'Nomor Port Baru',
  };

  const label = keyLabels[key] || key;
  let formattedVal = String(val);
  if (typeof val === 'boolean') {
    formattedVal = val ? 'Aktif' : 'Nonaktif (Cabut Sesi)';
  }

  return { label, value: formattedVal };
};

export function DraftActionCard({
  draft,
  onExecutedSuccess,
  formatPayloadEntry = defaultFormatPayloadEntry,
}: DraftActionCardProps) {
  const [state, setState] = useState<DraftCardState>('PENDING');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300); // 5 minutes
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const executionLockRef = useRef(false);
  const { showSuccess, showError } = useToast();

  // 1. 5-Minute Expiry Countdown Timer
  useEffect(() => {
    if (state !== 'PENDING') return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setState('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state]);

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  // 2. Execution Handler with 1ms Instant Click-Lock
  const handleApprove = async () => {
    if (executionLockRef.current || state !== 'PENDING') return;
    executionLockRef.current = true;
    setState('EXECUTING');
    setErrorMessage(null);

    try {
      const res = await webApiClient.post('/api/v1/admin/ai/confirm-action', {
        actionToken: draft.actionToken,
        actionType: draft.actionType,
        payload: draft.payload,
      });

      if (res.success) {
        setState('EXECUTED');
        const successMsg = `Aksi "${draft.title}" berhasil disetujui & dieksekusi secara aman ke database.`;
        showSuccess(successMsg);
        if (onExecutedSuccess) {
          onExecutedSuccess();
        }
      } else {
        setState('FAILED_REPLAY_BLOCKED');
        const sanitized = sanitizeUiErrorMessage(res.error);
        setErrorMessage(sanitized.message);
        showError(res.error);
      }
    } catch (err: unknown) {
      setState('FAILED_REPLAY_BLOCKED');
      const apiErr = err as ApiClientError;
      const isReplay = apiErr.code === ERROR_CODES.ACTION_TOKEN_REPLAYED;
      const isPortOccupied = apiErr.code === ERROR_CODES.PORT_OCCUPIED;

      let msg = apiErr.message || 'Eksekusi aksi gagal diproses server.';
      if (isReplay) {
        msg = 'Token aksi ini sudah pernah dieksekusi sebelumnya (Replay Blocked). Silakan minta draf baru.';
      } else if (isPortOccupied) {
        msg = 'Port splitter telah terisi oleh pelanggan aktif lain. Mutasi dibatalkan.';
      }

      setErrorMessage(msg);
      showError(msg);
    } finally {
      executionLockRef.current = false;
    }
  };

  const handleCancel = () => {
    if (state !== 'PENDING') return;
    setState('CANCELLED');
    showSuccess(`Draf aksi "${draft.title}" telah dibatalkan.`);
  };

  return (
    <div
      style={{
        marginTop: '14px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '16px 18px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)',
        color: '#0f172a',
      }}
    >
      {/* Card Header & Security Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color:
                state === 'EXECUTED'
                  ? '#16a34a'
                  : state === 'CANCELLED'
                  ? '#94a3b8'
                  : state === 'EXPIRED' || state === 'FAILED_REPLAY_BLOCKED'
                  ? '#dc2626'
                  : '#0e5b92',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: '3px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {state === 'PENDING' && 'Draft Persetujuan Admin (Human-in-the-Loop)'}
            {state === 'EXECUTING' && 'Sedang Memproses ke Database...'}
            {state === 'EXECUTED' && '✓ Berhasil Dieksekusi ke Database'}
            {state === 'CANCELLED' && '✕ Dibatalkan oleh Admin'}
            {state === 'EXPIRED' && '⏱ Masa Aktif Token Kedaluwarsa'}
            {state === 'FAILED_REPLAY_BLOCKED' && '⚠ Penolakan Server / Replay Blocked'}
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>
            {draft.title}
          </h3>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
            {draft.summary}
          </div>
        </div>

        {/* Monospace HMAC Verification & Live Countdown */}
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          <div>HMAC: <code>{draft.actionToken.substring(0, 10)}...</code></div>
          <div
            style={{
              fontSize: '11px',
              marginTop: '3px',
              fontWeight: 600,
              color:
                state === 'PENDING'
                  ? remainingSeconds < 60
                    ? '#dc2626'
                    : '#0e5b92'
                  : '#94a3b8',
            }}
          >
            {state === 'PENDING' ? `Sisa: ${formatCountdown(remainingSeconds)}` : 'Kedaluwarsa'}
          </div>
        </div>
      </div>

      {/* Grid Parameters Layout */}
      {draft.payload && (
        <div
          style={{
            paddingTop: '12px',
            paddingBottom: '12px',
            borderTop: '1px solid #edf2f7',
            borderBottom: '1px solid #edf2f7',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            rowGap: '10px',
            columnGap: '16px',
            marginBottom: '14px',
          }}
        >
          {Object.entries(draft.payload).map(([k, v]) => {
            const entry = formatPayloadEntry(k, v);
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 500, color: '#64748b' }}>
                  {entry.label}
                </span>
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#0f172a',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error / Failure Banner */}
      {errorMessage && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#b91c1c',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Icon name="shield" size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action / State Controls */}
      <div>
        {state === 'EXECUTED' ? (
          <div
            style={{
              fontSize: '12px',
              color: '#16a34a',
              lineHeight: 1.5,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✓ Mutasi telah tervalidasi dan tercatat permanen pada activity_logs.</span>
          </div>
        ) : state === 'CANCELLED' ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Aksi dibatalkan. Tidak ada mutasi yang diterapkan pada database.
          </div>
        ) : state === 'EXPIRED' ? (
          <div style={{ fontSize: '12px', color: '#dc2626' }}>
            Masa aktif 5 menit telah habis. Token HMAC ini tidak dapat dieksekusi lagi demi keamanan. Silakan minta AI membuat draf baru.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="button primary"
              disabled={state === 'EXECUTING'}
              onClick={handleApprove}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontSize: '12.5px',
                fontWeight: 600,
                borderRadius: '9999px',
                background: state === 'EXECUTING' ? '#94a3b8' : '#0e5b92',
                color: '#ffffff',
                cursor: state === 'EXECUTING' ? 'not-allowed' : 'pointer',
              }}
            >
              {state === 'EXECUTING' ? (
                <>
                  <Icon name="refresh" size={13} className="animate-spin" />
                  <span>Mengeksekusi...</span>
                </>
              ) : (
                <span>Setujui &amp; Eksekusi</span>
              )}
            </button>
            <button
              className="button"
              disabled={state === 'EXECUTING'}
              onClick={handleCancel}
              type="button"
              style={{
                padding: '8px 16px',
                fontSize: '12.5px',
                color: '#64748b',
                borderRadius: '9999px',
                border: 'none',
                background: 'transparent',
                cursor: state === 'EXECUTING' ? 'not-allowed' : 'pointer',
              }}
            >
              Batalkan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
