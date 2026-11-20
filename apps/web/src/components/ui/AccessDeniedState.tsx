'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { ERROR_CATEGORY_DICTIONARY } from '@/lib/error-dictionary';
import '@/styles/components/error-ux.css';

export interface AccessDeniedStateProps {
  /** Calm user-facing heading for the 403 restriction. */
  title?: string;
  /** Polite Indonesian guidance without blaming the user. */
  description?: string;
  /** Optional role or permission summary for clarity. */
  requiredRole?: string;
  /** Primary navigation fallback path. Defaults to `/`. */
  homeHref?: string;
  /** Label for the home link button. */
  homeLabel?: string;
  /** Optional custom back callback; defaults to `router.back()`. */
  onBack?: () => void;
  /** Layout framing: `'panel'` inside dashboard or `'full'` standalone. */
  variant?: 'panel' | 'full';
  className?: string;
}

export function AccessDeniedState({
  title = ERROR_CATEGORY_DICTIONARY.FORBIDDEN.title,
  description = ERROR_CATEGORY_DICTIONARY.FORBIDDEN.message,
  requiredRole,
  homeHref = '/',
  homeLabel = 'Kembali ke Beranda',
  onBack,
  variant = 'panel',
  className = '',
}: AccessDeniedStateProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(homeHref);
    }
  };

  return (
    <div className={`ui-access-denied-shell ui-access-denied-shell--${variant} ${className}`.trim()}>
      <section className="ui-access-denied-card" role="alert" aria-live="polite">
        <div className="ui-access-denied-icon" aria-hidden="true">
          <Icon name="lock" size={22} />
        </div>

        <span className="ui-access-denied-badge">
          <Icon name="shield" size={12} />
          <span>{requiredRole ? `Khusus ${requiredRole}` : 'Pembatasan Hak Akses (403)'}</span>
        </span>

        <h2 className="ui-access-denied-title">{title}</h2>
        <p className="ui-access-denied-desc">{description}</p>

        <div className="ui-access-denied-actions">
          <button
            type="button"
            onClick={handleBack}
            className="ui-access-denied-btn ui-access-denied-btn--secondary"
          >
            <Icon name="arrowLeft" size={14} />
            <span>Kembali</span>
          </button>
          <Link href={homeHref} className="ui-access-denied-btn ui-access-denied-btn--primary">
            <Icon name="home" size={14} />
            <span>{homeLabel}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
