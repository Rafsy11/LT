'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { TechnicianFilterTab } from './technician-filters';

export interface TechnicianStatsProps {
  totalCount: number;
  activeSessionsCount: number;
  busyCount: number;
  revokedCount: number;
  disabledCount: number;
  activeTab: TechnicianFilterTab;
  onSelectTab: (tab: TechnicianFilterTab) => void;
}

export function TechnicianStats({
  totalCount,
  activeSessionsCount,
  busyCount,
  revokedCount,
  disabledCount,
  activeTab,
  onSelectTab,
}: TechnicianStatsProps) {
  const isRestrictedActive = activeTab === 'revoked' || activeTab === 'inactive';

  const handleSelectRestricted = () => {
    if (activeTab === 'revoked' && disabledCount > 0) {
      onSelectTab('inactive');
      return;
    }
    if (activeTab === 'inactive' && revokedCount > 0) {
      onSelectTab('revoked');
      return;
    }
    if (revokedCount > 0) {
      onSelectTab('revoked');
      return;
    }
    onSelectTab('inactive');
  };

  return (
    <section className="technicians-stats-grid" aria-label="Ringkasan Teknisi dan Sesi Perangkat">
      <button
        type="button"
        className={`stat-card stat-card--total ${activeTab === 'all' ? 'active' : ''}`}
        onClick={() => onSelectTab('all')}
        aria-pressed={activeTab === 'all'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="wrench" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Teknisi Terdaftar</span>
              <span className="stat-card-value">{totalCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Akun teknisi lapangan pada cakupan filter</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--active ${activeTab === 'active_session' ? 'active' : ''}`}
        onClick={() => onSelectTab('active_session')}
        aria-pressed={activeTab === 'active_session'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="smartphone" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sesi Mobile Aktif</span>
              <span className="stat-card-value">{activeSessionsCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Sedang masuk pada aplikasi mobile</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--busy ${activeTab === 'busy' ? 'active' : ''}`}
        onClick={() => onSelectTab('busy')}
        aria-pressed={activeTab === 'busy'}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="clock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Sedang Bertugas</span>
              <span className="stat-card-value">{busyCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">Memegang tiket terbuka di lapangan</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={`stat-card stat-card--restricted ${isRestrictedActive ? 'active' : ''}`}
        onClick={handleSelectRestricted}
        aria-pressed={isRestrictedActive}
      >
        <div className="stat-card-inner">
          <div className="stat-card-top">
            <span className="stat-card-icon-round" aria-hidden="true">
              <Icon name="lock" size={17} />
            </span>
            <div className="stat-card-text">
              <span className="stat-card-label">Dicabut &amp; Terkunci</span>
              <span className="stat-card-value">{revokedCount + disabledCount}</span>
            </div>
          </div>
          <div className="stat-card-footer">
            <span className="caption">
              {revokedCount} sesi dicabut · {disabledCount} akun terkunci
            </span>
          </div>
        </div>
      </button>
    </section>
  );
}
