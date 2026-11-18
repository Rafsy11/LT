'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  clearServiceUnavailable,
  formatSafeUiError,
  getServiceUnavailableState,
  reportServiceUnavailable,
  subscribeServiceUnavailable,
  type ServiceUnavailableState,
} from '@/lib/api-error';

/**
 * Global non-intrusive connectivity banner displayed at the top of the dashboard shell
 * when core services fail health checks, keeping technical internals redacted from UI copy.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<ServiceUnavailableState>(() => getServiceUnavailableState());
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setState(getServiceUnavailableState());
    return subscribeServiceUnavailable((nextState) => {
      setState(nextState);
    });
  }, []);

  const handleRetry = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);

    try {
      const res = await fetch('/api/v1/health', { cache: 'no-store' });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        clearServiceUnavailable();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app:refresh-data'));
        }
      } else {
        const safe = formatSafeUiError(
          { code: 'SERVICE_UNAVAILABLE' },
          { fallbackMessage: 'Layanan sistem pusat belum merespons. Silakan coba beberapa saat lagi.' },
        );
        reportServiceUnavailable(safe.message, state.category, '/api/v1/health');
      }
    } catch {
      reportServiceUnavailable(
        'Server aplikasi tidak merespons pemeriksaan kesehatan sistem.',
        state.category,
        '/api/v1/health',
      );
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, state.category]);

  if (!state.active) {
    return null;
  }

  const safeBanner = formatSafeUiError(state.message, {
    fallbackMessage: 'Layanan sistem pusat sedang mengalami gangguan sementara. Silakan coba beberapa saat lagi.',
  });

  return (
    <section
      className="connection-banner"
      role="alert"
      aria-live="assertive"
      aria-label="Status Koneksi Layanan Sistem"
    >
      <div className="connection-banner-icon" aria-hidden="true">
        <Icon name="alert" size={18} />
      </div>
      <div className="connection-banner-copy">
        <strong className="connection-banner-title">
          Koneksi Layanan Sistem Terganggu
        </strong>
        <p className="connection-banner-message">
          {safeBanner.message}
        </p>
      </div>
      <div className="connection-banner-actions">
        <button
          type="button"
          className="connection-banner-retry"
          onClick={handleRetry}
          disabled={isChecking}
        >
          <Icon name="sync" size={14} />
          <span>{isChecking ? 'Memeriksa...' : 'Coba Lagi'}</span>
        </button>
        <button
          type="button"
          className="connection-banner-dismiss"
          onClick={() => clearServiceUnavailable()}
          aria-label="Tutup peringatan koneksi"
          title="Tutup peringatan"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </section>
  );
}

