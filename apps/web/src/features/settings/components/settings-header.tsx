'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';

export interface SettingsHeaderProps {
  isSuperAdmin: boolean;
  roleName?: string;
  isSaving: boolean;
  hasChanges: boolean;
  onSave: () => void;
}

export function SettingsHeader({
  isSuperAdmin,
  roleName,
  isSaving,
  hasChanges,
  onSave,
}: SettingsHeaderProps) {
  return (
    <header className="overview-header settings-page-header">
      <div className="overview-header-copy">
        <div className="eyebrow settings-header-eyebrow">
          KONSOL ON-PREMISE · DOCKER COMPOSE
        </div>
        <h1 className="overview-greeting settings-header-title">Pengaturan Sistem &amp; Infrastruktur</h1>
        <p className="overview-subtitle settings-header-subtitle">
          Manajemen sumber daya server lokal, kontainer Docker, geofencing lapangan, dan pemulihan 3-2-1.
        </p>
      </div>

      <nav
        className="overview-toolbar settings-header-toolbar"
        aria-label="Aksi kontrol pengaturan"
      >
        <div className="overview-status-pill settings-status-pill-mobile">
          <span className="status-dot status-dot--ok" />
          <span>Docker: 6 Normal</span>
        </div>

        <div className="settings-role-badge">
          <Icon name="shield" size={13} />
          <span>
            {isSuperAdmin ? 'Super Admin' : `${roleName || 'Operator'}`}
          </span>
        </div>

        {/* Quick Header Save Action */}
        <button
          type="button"
          onClick={onSave}
          disabled={!isSuperAdmin || isSaving || !hasChanges}
          className={`settings-header-save-btn ${!isSuperAdmin || !hasChanges ? 'disabled' : ''} ${hasChanges ? 'has-changes' : ''}`}
        >
          {isSaving ? (
            <Icon name="refresh" size={13} className="spin" />
          ) : (
            <Icon name="check" size={13} />
          )}
          <span>{isSaving ? 'Menyimpan...' : hasChanges ? 'Simpan' : 'Tersimpan'}</span>
        </button>
      </nav>
    </header>
  );
}
