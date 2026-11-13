'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RoleHeaderProps {
  isFetching: boolean;
  onRefresh: () => void;
  onOpenAddUser?: () => void;
}

export function RoleHeader({ isFetching, onRefresh, onOpenAddUser }: RoleHeaderProps) {
  return (
    <header className="overview-header" style={{ marginBottom: '28px' }}>
      <div className="overview-header-copy">
        <h1 className="overview-greeting">Role-Based Access Control</h1>
        <p className="overview-subtitle">
          Pengelolaan direktori pengguna, penugasan peran operasional, dan konfigurasi matriks izin
          sistem FTTH.
        </p>
      </div>

      <nav className="overview-toolbar" aria-label="Aksi kontrol peran" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            className="status-dot status-dot--ok"
            style={{ boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)' }}
          />
          Otoritas Sistem Terpantau
        </div>

        {onOpenAddUser && (
          <button
            type="button"
            onClick={onOpenAddUser}
            className="button primary ui-btn-solid-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(14, 91, 146, 0.25)',
            }}
          >
            <Icon name="plus" size={14} />
            <span>Tambah Pengguna</span>
          </button>
        )}
      </nav>
    </header>
  );
}
