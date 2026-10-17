'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui/Icon';

interface RoleSwitcherBarProps {
  pageTitle?: string;
}

export function RoleSwitcherBar({ pageTitle = 'Overview' }: RoleSwitcherBarProps) {
  const { currentPresetKey, setRolePreset, availablePresets } = useAuth();

  return (
    <div className="role-switcher-bar">
      <div className="subbar-breadcrumb">
        <span>Workspace</span>
        <span className="breadcrumb-arrow">›</span>
        <b>{pageTitle}</b>
      </div>

      <div className="role-switcher-segmented" role="group" aria-label="Pilih peran simulasi">
        {Object.entries(availablePresets).map(([key, preset]) => {
          const isActive = currentPresetKey === key;
          return (
            <button
              key={key}
              onClick={() => setRolePreset(key)}
              className={`role-seg-btn ${isActive ? 'active' : ''}`}
              title={preset.description}
              type="button"
            >
              {preset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
