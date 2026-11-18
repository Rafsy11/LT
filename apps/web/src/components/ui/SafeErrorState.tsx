'use client';

import React from 'react';
import Link from 'next/link';
import { STANDARD_ERROR_MESSAGES } from '@repo/shared';
import { Icon } from './Icon';
import { formatSafeUiError } from '@/lib/api-error';
import '@/styles/components/safe-error-state.css';

export interface SafeErrorStateProps {
  /** Raw error object or string; sanitized before render to prevent info leakage. */
  error?: unknown;
  /** Optional Next.js error digest string for internal incident tracking. */
  digest?: string;
  /** Calm user-facing title. */
  title?: string;
  /** Optional explicit fallback description (still sanitized). */
  description?: string;
  /** Recovery retry callback (e.g. error boundary reset or data refetch). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional fallback navigation path back to safety. */
  homeHref?: string;
  homeLabel?: string;
  /** Visual framing size: 'full' (root boundary), 'panel' (dashboard section), 'compact' (inline). */
  variant?: 'full' | 'panel' | 'compact';
  className?: string;
}

export function SafeErrorState({
  error,
  digest,
  title = 'Terjadi Kendala Sementara pada Sistem',
  description,
  onRetry,
  retryLabel = 'Coba Lagi',
  homeHref,
  homeLabel = 'Kembali ke Beranda',
  variant = 'panel',
  className = '',
}: SafeErrorStateProps) {
  const safeError = formatSafeUiError(error, {
    fallbackMessage: description || STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
    digest,
  });

  const displayDescription = description
    ? formatSafeUiError(description, { fallbackMessage: safeError.message }).message
    : safeError.message;

  return (
    <div className={`ui-safe-error-shell ui-safe-error-shell--${variant} ${className}`.trim()}>
      <section className="ui-safe-error-card" role="alert" aria-live="assertive">
        <div className="ui-safe-error-icon-box" aria-hidden="true">
          <Icon name="alert" size={variant === 'compact' ? 18 : 22} />
        </div>

        <h2 className="ui-safe-error-title">{title}</h2>
        <p className="ui-safe-error-desc">{displayDescription}</p>

        <div className="ui-safe-error-ref" aria-label="Kode referensi insiden">
          <Icon name="shield" size={12} />
          <span>Kode Referensi: {safeError.refId}</span>
        </div>

        {(onRetry || homeHref) && (
          <div className="ui-safe-error-actions">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="ui-safe-error-btn ui-safe-error-btn--primary"
              >
                <Icon name="refresh" size={14} />
                <span>{retryLabel}</span>
              </button>
            )}
            {homeHref && (
              <Link href={homeHref} className="ui-safe-error-btn ui-safe-error-btn--secondary">
                <Icon name="home" size={14} />
                <span>{homeLabel}</span>
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export { SafeErrorState as ErrorState };
export type { SafeErrorStateProps as ErrorStateProps };

