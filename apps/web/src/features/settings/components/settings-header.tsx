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
    <div className="overview-header" style={{ marginBottom: '22px' }}>
      <div className="overview-header-copy">
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#0e5b92',
            textTransform: 'uppercase',
            marginBottom: '3px',
          }}
        >
          KONSOL ON-PREMISE · DOCKER COMPOSE ORCHESTRATION
        </div>
        <h1 className="overview-greeting">Pengaturan Sistem &amp; Infrastruktur</h1>
        <p className="overview-subtitle">
          Manajemen sumber daya server lokal, isolasi kontainer Docker, parameter geofencing
          lapangan, dan pemulihan bencana 3-2-1.
        </p>
      </div>

      <div
        className="overview-toolbar"
        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
      >
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
            }}
          />
          <span>Docker: 6 Layanan Normal</span>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: '#f0f7ff',
            border: '1px solid #c8e0f4',
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#0e5b92',
          }}
        >
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
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#ffffff',
            background: !isSuperAdmin || !hasChanges ? '#94a3b8' : '#0e5b92',
            border: 'none',
            borderRadius: '6px',
            cursor: !isSuperAdmin || !hasChanges ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: hasChanges ? '0 1px 3px rgba(14, 91, 146, 0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {isSaving ? (
            <Icon name="refresh" size={13} className="spin" />
          ) : (
            <Icon name="check" size={13} />
          )}
          <span>{isSaving ? 'Menyimpan...' : hasChanges ? 'Simpan Perubahan' : 'Tersimpan'}</span>
        </button>
      </div>
    </div>
  );
}
