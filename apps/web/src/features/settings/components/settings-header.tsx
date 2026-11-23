'use client';

import React from 'react';
import { SystemTelemetryData } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';

export interface SettingsHeaderProps {
  telemetry: SystemTelemetryData | null;
  isSuperAdmin: boolean;
  roleName?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function SettingsHeader({
  telemetry,
  isSuperAdmin,
  roleName,
  isRefreshing,
  onRefresh,
}: SettingsHeaderProps) {
  const containers = telemetry?.containers ?? [];
  const totalCount = containers.length;
  const healthyCount = containers.filter((c) => c.status === 'HEALTHY').length;
  const criticalCount = containers.filter((c) => c.status === 'CRITICAL').length;

  const statusDotClass =
    totalCount === 0
      ? 'status-dot--muted'
      : criticalCount > 0
        ? 'status-dot--danger'
        : healthyCount < totalCount
          ? 'status-dot--warn'
          : 'status-dot--ok';

  const statusText =
    totalCount === 0
      ? 'Telemetri Memuat'
      : criticalCount > 0
        ? `${healthyCount}/${totalCount} Layanan Normal (${criticalCount} Kritis)`
        : `${healthyCount}/${totalCount} Layanan Normal`;

  return (
    <header className="overview-header settings-page-header">
      <div className="overview-header-copy">
        <div className="eyebrow settings-header-eyebrow">
          KONSOL ON-PREMISE · OPERASIONAL
        </div>
        <h1 className="overview-greeting settings-header-title">
          Pengaturan Sistem &amp; Infrastruktur
        </h1>
        <p className="overview-subtitle settings-header-subtitle">
          Kelola konfigurasi komputasi AI lokal, validasi lapangan, pencadangan 3-2-1, serta
          akses jaringan aplikasi teknisi.
        </p>
      </div>

      <nav
        className="overview-toolbar settings-header-toolbar"
        aria-label="Aksi kontrol pengaturan"
      >
        <div className="overview-status-pill settings-status-pill-mobile">
          <span className={`status-dot ${statusDotClass}`} aria-hidden="true" />
          <span>{statusText}</span>
        </div>

        <div className="settings-role-badge">
          <Icon name="shield" size={13} />
          <span>{isSuperAdmin ? 'Super Admin' : roleName || 'Operator'}</span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="settings-header-refresh-btn"
        >
          <Icon name="refresh" size={13} className={isRefreshing ? 'icon-spin' : ''} />
          <span>{isRefreshing ? 'Menyegarkan...' : 'Segarkan Telemetri'}</span>
        </button>
      </nav>
    </header>
  );
}
