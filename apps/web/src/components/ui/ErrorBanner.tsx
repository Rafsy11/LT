'use client';

import React from 'react';
import { STANDARD_ERROR_MESSAGES, STANDARD_ACTION_LABELS } from '@repo/shared';
import { Icon } from './Icon';
import { formatSafeUiError } from '@/lib/api-error';

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
  title = 'Gagal Memuat Data Operasional',
  message,
  onRetry,
  retryLabel = STANDARD_ACTION_LABELS.RETRY,
  onDismiss,
  className = '',
}: ErrorBannerProps) {
  const safeError = formatSafeUiError(error, {
    fallbackMessage: message || STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
  });

  const displayMessage = message
    ? formatSafeUiError(message, { fallbackMessage: safeError.message }).message
    : safeError.message;

  return (
    <div
      className={`connection-banner ${className}`.trim()}
      role="alert"
      aria-live="assertive"
    >
      <div className="connection-banner-icon" aria-hidden="true">
        <Icon name="alert" size={18} />
      </div>

      <div className="connection-banner-copy">
        <strong className="connection-banner-title">{title}</strong>
        <p className="connection-banner-message">{displayMessage}</p>
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
              <span>{retryLabel}</span>
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
