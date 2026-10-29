'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface RoleHeaderProps {
  isFetching: boolean;
  onRefresh: () => void;
}

export function RoleHeader({ isFetching, onRefresh }: RoleHeaderProps) {
  return (
    <div className="overview-header" style={{ marginBottom: '28px' }}>
      <div className="overview-header-copy">
        <h1 className="overview-greeting">Role-Based Access Control</h1>
        <p className="overview-subtitle">
          Pengelolaan direktori pengguna, penugasan peran operasional, dan konfigurasi matriks izin sistem FTTH.
        </p>
      </div>

      <div className="overview-toolbar">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: '#ffffff',
            border: '1px solid #dce7f0',
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 500,
            color: '#334155',
            boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
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

        <button
          className="button"
          onClick={onRefresh}
          disabled={isFetching}
          title="Segarkan data akses"
          type="button"
          style={{
            padding: '6px 10px',
            background: '#ffffff',
            border: '1px solid #dce7f0',
            borderRadius: '6px',
            color: '#475569',
            fontSize: '12px',
            boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Icon name="refresh" size={14} className={isFetching ? 'spin' : ''} />
        </button>
      </div>
    </div>
  );
}

