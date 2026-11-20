'use client';

import React from 'react';
import { STANDARD_ERROR_MESSAGES, STANDARD_ACTION_LABELS } from '@repo/shared';
import { Icon } from './Icon';
import { formatSafeUiError } from '@/lib/api-error';
import { isAppError } from '@/lib/error-normalizer';
import '@/styles/components/error-ux.css';

export interface ErrorBannerProps {
  /** Raw error object or string; sanitized to prevent data leakage */
  error?: unknown;
  /** Primary banner title in standard Indonesian */
  title?: string;
  /** Contextual message or explanation in standard Indonesian */
  message?: string;
  /** Optional retry callback */
  onRetry?: () => void;
  /** Optional custom retry button label (defaults to 'Coba Lagi') */
  retryLabel?: string;
  /** Optional callback when user dismisses the banner */
  onDismiss?: () => void;
  /** Additional CSS class names */
  className?: string;
}

export function ErrorBanner({
  error,
  title,
  message,
  onRetry,
  retryLabel,
  onDismiss,
  className = '',
}: ErrorBannerProps) {
  const normalizedAppErr = isAppError(error) ? error : null;
  const safeError = formatSafeUiError(error, {
    fallbackMessage: message || STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
  });

  const resolvedTitle =
    title || normalizedAppErr?.title || 'Gagal Memuat Data Operasional';

  const displayMessage = message
    ? formatSafeUiError(message, { fallbackMessage: safeError.message }).message
    : normalizedAppErr?.message || safeError.message;

  const isWarningCategory =
    normalizedAppErr?.category === 'TIMEOUT' ||
    normalizedAppErr?.category === 'OFFLINE' ||
    normalizedAppErr?.category === 'RATE_LIMITED';

  const showRefCode =
    normalizedAppErr?.category === 'SERVER_ERROR' || (normalizedAppErr?.statusCode ?? 0) >= 500;

  const iconName =
    normalizedAppErr?.category === 'OFFLINE'
      ? 'wifiOff'
      : normalizedAppErr?.category === 'TIMEOUT' || normalizedAppErr?.category === 'RATE_LIMITED'
        ? 'clock'
        : 'alert';

  return (
    <div
      className={`connection-banner ${isWarningCategory ? 'connection-banner--warning' : ''} ${className}`.trim()}
      role="alert"
      aria-live="assertive"
    >
      <div className="connection-banner-icon" aria-hidden="true">
        <Icon name={iconName} size={18} />
      </div>

      <div className="connection-banner-copy">
        <strong className="connection-banner-title">{resolvedTitle}</strong>
        <p className="connection-banner-message">{displayMessage}</p>
        {showRefCode && normalizedAppErr?.refCode && (
          <span className="connection-banner-ref">Ref: {normalizedAppErr.refCode}</span>
        )}
      </div>

      {(onRetry || onDismiss) && (
        <div className="connection-banner-actions">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="connection-banner-retry"
            >
              <Icon name="refresh" size={13} />
              <span>{retryLabel || normalizedAppErr?.actionLabel || STANDARD_ACTION_LABELS.RETRY}</span>
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="connection-banner-dismiss"
              aria-label="Tutup pemberitahuan"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
