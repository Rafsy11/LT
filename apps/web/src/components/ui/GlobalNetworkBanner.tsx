'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { ERROR_CATEGORY_DICTIONARY } from '@/lib/error-dictionary';
import { useNetworkStatus } from '@/providers/network-status-provider';
import '@/styles/components/error-ux.css';

/**
 * Global non-intrusive top status banner for:
 * - Browser offline connectivity (preserves user inputs/drafts)
 * - Auto-dismissing reconnected confirmation
 * - HTTP 503 Service Unavailable (maintenance or overload)
 */
export function GlobalNetworkBanner() {
  const {
    isOnline,
    wasOffline,
    serviceUnavailable,
    isChecking,
    checkConnection,
    dismissMaintenance,
  } = useNetworkStatus();

  if (!isOnline) {
    return (
      <section
        className="global-network-banner global-network-banner--offline"
        role="status"
        aria-live="assertive"
        aria-label="Status Koneksi Internet"
      >
        <div className="global-network-banner-inner">
          <div className="global-network-banner-leading">
            <span className="global-network-banner-icon" aria-hidden="true">
              <Icon name="wifiOff" size={18} />
            </span>
            <div className="global-network-banner-copy">
              <strong className="global-network-banner-title">
                {ERROR_CATEGORY_DICTIONARY.OFFLINE.title}
              </strong>
              <p className="global-network-banner-desc">
                {ERROR_CATEGORY_DICTIONARY.OFFLINE.message}
              </p>
            </div>
          </div>
          <div className="global-network-banner-actions">
            <button
              type="button"
              className="global-network-banner-btn"
              onClick={() => void checkConnection()}
              disabled={isChecking}
            >
              <Icon name="refresh" size={14} />
              <span>{isChecking ? 'Memeriksa...' : ERROR_CATEGORY_DICTIONARY.OFFLINE.actionLabel}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (wasOffline) {
    return (
      <section
        className="global-network-banner global-network-banner--reconnected"
        role="status"
        aria-live="polite"
        aria-label="Koneksi Internet Kembali Tersambung"
      >
        <div className="global-network-banner-inner">
          <div className="global-network-banner-leading">
            <span className="global-network-banner-icon" aria-hidden="true">
              <Icon name="wifi" size={18} />
            </span>
            <div className="global-network-banner-copy">
              <strong className="global-network-banner-title">Koneksi Kembali Terhubung</strong>
              <p className="global-network-banner-desc">
                Jaringan telah pulih. Anda dapat melanjutkan pekerjaan Anda kembali.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (serviceUnavailable.active) {
    return (
      <section
        className="global-network-banner global-network-banner--maintenance"
        role="alert"
        aria-live="assertive"
        aria-label="Status Pemeliharaan Layanan"
      >
        <div className="global-network-banner-inner">
          <div className="global-network-banner-leading">
            <span className="global-network-banner-icon" aria-hidden="true">
              <Icon name="alert" size={18} />
            </span>
            <div className="global-network-banner-copy">
              <strong className="global-network-banner-title">
                {ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.title}
              </strong>
              <p className="global-network-banner-desc">
                {ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.message}
              </p>
            </div>
          </div>
          <div className="global-network-banner-actions">
            <button
              type="button"
              className="global-network-banner-btn"
              onClick={() => void checkConnection()}
              disabled={isChecking}
            >
              <Icon name="refresh" size={14} />
              <span>
                {isChecking
                  ? 'Memeriksa...'
                  : ERROR_CATEGORY_DICTIONARY.SERVICE_UNAVAILABLE.actionLabel}
              </span>
            </button>
            <button
              type="button"
              className="global-network-banner-dismiss"
              onClick={dismissMaintenance}
              aria-label="Tutup pemberitahuan layanan"
              title="Tutup"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
