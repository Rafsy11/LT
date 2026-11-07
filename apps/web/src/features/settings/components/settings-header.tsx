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
    <header className="overview-header" style={{ marginBottom: '22px' }}>
      <div className="overview-header-copy">
        <div className="eyebrow">
          KONSOL ON-PREMISE · DOCKER COMPOSE ORCHESTRATION
        </div>
        <h1 className="overview-greeting">Pengaturan Sistem &amp; Infrastruktur</h1>
        <p className="overview-subtitle">
          Manajemen sumber daya server lokal, isolasi kontainer Docker, parameter geofencing
          lapangan, dan pemulihan bencana 3-2-1.
        </p>
      </div>

      <nav
        className="overview-toolbar"
        aria-label="Aksi kontrol pengaturan"
        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
      >
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
            }}
          />
          <span>Docker: 6 Layanan Normal</span>
        </div>

        <div className="settings-role-badge">
          <Icon name="shield" size={13} />
          <span>
            {isSuperAdmin ? 'Super Admin (Level 100)' : `${roleName || 'Operator'} (Read-Only)`}
          </span>
        </div>

        {/* Quick Header Save Action */}
        <button
          type="button"
          onClick={onSave}
          disabled={!isSuperAdmin || isSaving || !hasChanges}
          className={`settings-header-save-btn ${!isSuperAdmin || !hasChanges ? 'disabled' : ''}`}
        >
          {isSaving ? (
            <Icon name="refresh" size={13} className="spin" />
          ) : (
            <Icon name="check" size={13} />
          )}
          <span>{isSaving ? 'Menyimpan...' : hasChanges ? 'Simpan Perubahan' : 'Tersimpan'}</span>
        </button>
      </nav>
    </header>
  );
}
