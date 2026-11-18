'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface MobileDevToolsGuardProps {
  /** Whether the guard should render and lock the login form. */
  isBlocked: boolean;
  /** Optional callback to force an immediate status recheck. */
  onRecheck: () => void;
}

/**
 * Full-viewport mobile security barrier rendered exclusively when Developer Tools
 * are active on `/login`. Disappears automatically once DevTools are closed.
 */
export function MobileDevToolsGuard({ isBlocked, onRecheck }: MobileDevToolsGuardProps) {
  if (!isBlocked) {
    return null;
  }

  return (
    <div
      className="auth-devtools-guard-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="devtools-guard-title"
      aria-describedby="devtools-guard-desc"
    >
      <section className="auth-devtools-guard-card">
        <div className="auth-devtools-guard-icon" aria-hidden="true">
          <Icon name="shield" size={24} />
        </div>

        <span className="auth-devtools-guard-badge">KEAMANAN PORTAL MOBILE</span>

        <h2 id="devtools-guard-title" className="auth-devtools-guard-title">
          Matikan Developer Tools Terlebih Dahulu
        </h2>

        <p id="devtools-guard-desc" className="auth-devtools-guard-desc">
          Demi keamanan kredensial dan sesi operasional FiberOps, halaman login tidak dapat diakses
          selama Developer Tools atau mode inspeksi aktif pada tampilan seluler.
        </p>

        <ol className="auth-devtools-guard-steps">
          <li>
            Tutup panel <strong>Inspect / Developer Tools</strong> atau nonaktifkan{' '}
            <strong>USB Remote Debugging</strong> pada peramban Anda.
          </li>
          <li>
            Halaman login akan terbuka kembali secara otomatis begitu Developer Tools dinonaktifkan.
          </li>
        </ol>

        <div className="auth-devtools-guard-footer">
          <button
            type="button"
            onClick={onRecheck}
            className="auth-devtools-guard-btn"
          >
            <Icon name="refresh" size={14} />
            <span>Periksa Ulang Status Perangkat</span>
          </button>
          <p className="auth-devtools-guard-hint">
            Memantau status secara otomatis setiap saat...
          </p>
        </div>
      </section>
    </div>
  );
}
