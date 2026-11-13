'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DraftActionCardData, sanitizeUiErrorMessage, ERROR_CODES } from '@repo/shared';
import { useToast } from '@/providers';
import { Icon } from '@/components/ui/Icon';
import { webApiClient, ApiClientError } from '@/lib/api-client';
import { invalidateQueryCache } from '@/lib/query-cache';

const AI_MUTATION_CACHE_KEYS = [
  '/api/v1/admin/tickets',
  '/api/v1/admin/overview',
  '/api/v1/admin/customers',
  '/api/v1/admin/technicians',
  '/api/v1/admin/clusters',
];

export type DraftCardState =
  'PENDING' | 'EXECUTING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED_REPLAY_BLOCKED';

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
        invalidateQueryCache(...AI_MUTATION_CACHE_KEYS);
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
        msg =
          'Token aksi ini sudah pernah dieksekusi sebelumnya (Replay Blocked). Silakan minta draf baru.';
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
    <article
      aria-label={`Draf Aksi: ${draft.title}`}
      className="draft-card"
    >
      {/* Card Header & Security Info */}
      <header
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
            className={
              state === 'EXECUTED'
                ? 'ui-text-ok'
                : state === 'CANCELLED'
                  ? 'ui-text-muted'
                  : state === 'EXPIRED' || state === 'FAILED_REPLAY_BLOCKED'
                    ? 'ui-text-danger'
                    : 'ui-text-primary'
            }
            style={{
              fontSize: '11px',
              fontWeight: 600,
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
          <h3 className="draft-card-title">
            {draft.title}
          </h3>
          <div className="draft-card-summary">{draft.summary}</div>
        </div>

        {/* Monospace HMAC Verification & Live Countdown */}
        <div
          className="ui-text-muted"
          style={{
            fontSize: '11px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          <div>
            HMAC: <code>{draft.actionToken.substring(0, 10)}...</code>
          </div>
          <time
            dateTime={`PT${remainingSeconds}S`}
            className={
              state === 'PENDING'
                ? remainingSeconds < 60
                  ? 'ui-text-danger'
                  : 'ui-text-primary'
                : 'ui-text-muted'
            }
            style={{
              display: 'block',
              fontSize: '11px',
              marginTop: '3px',
              fontWeight: 600,
            }}
          >
            {state === 'PENDING' ? `Sisa: ${formatCountdown(remainingSeconds)}` : 'Kedaluwarsa'}
          </time>
        </div>
      </header>

      {/* Grid Parameters Layout */}
      {draft.payload && (
        <div className="draft-action-kpi-grid">
          {Object.entries(draft.payload).map(([k, v]) => {
            const entry = formatPayloadEntry(k, v);
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="draft-kpi-lbl">
                  {entry.label}
                </span>
                <span className="draft-kpi-val">
                  {entry.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error / Failure Banner */}
      {errorMessage && (
        <aside
          role="alert"
          aria-live="assertive"
          className="ui-alert-banner ui-alert-banner--error"
          style={{
            padding: '8px 12px',
            fontSize: '12px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Icon name="shield" size={14} />
          <span>{errorMessage}</span>
        </aside>
      )}

      {/* Action / State Controls */}
      <footer>
        {state === 'EXECUTED' ? (
          <div
            className="ui-text-ok"
            style={{
              fontSize: '12px',
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
          <div className="ui-text-muted" style={{ fontSize: '12px' }}>
            Aksi dibatalkan. Tidak ada mutasi yang diterapkan pada database.
          </div>
        ) : state === 'EXPIRED' ? (
          <div className="ui-text-danger" style={{ fontSize: '12px' }}>
            Masa aktif 5 menit telah habis. Token HMAC ini tidak dapat dieksekusi lagi demi
            keamanan. Silakan minta AI membuat draf baru.
          </div>
        ) : (
          <div
            role="group"
            aria-label="Aksi draf persetujuan"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <button
              className={`button primary ${state === 'EXECUTING' ? '' : 'ui-btn-solid-primary'}`}
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
                borderRadius: '6px',
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
              className="button ui-text-muted"
              disabled={state === 'EXECUTING'}
              onClick={handleCancel}
              type="button"
              style={{
                padding: '8px 16px',
                fontSize: '12.5px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                cursor: state === 'EXECUTING' ? 'not-allowed' : 'pointer',
              }}
            >
              Batalkan
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
