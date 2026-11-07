'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RoleHeaderProps {
  isFetching: boolean;
  onRefresh: () => void;
}

export function RoleHeader({ isFetching, onRefresh }: RoleHeaderProps) {
  return (
    <header className="overview-header" style={{ marginBottom: '28px' }}>
      <div className="overview-header-copy">
        <h1 className="overview-greeting">Role-Based Access Control</h1>
        <p className="overview-subtitle">
          Pengelolaan direktori pengguna, penugasan peran operasional, dan konfigurasi matriks izin
          sistem FTTH.
        </p>
      </div>

      <nav className="overview-toolbar" aria-label="Aksi kontrol peran">
        <div
          className="overview-status-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#16a34a',
              display: 'inline-block',
              boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)',
            }}
          />
          Otoritas Sistem Terpantau
        </div>


      </nav>
    </header>
  );
}
