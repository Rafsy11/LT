'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { AccessDeniedState } from '@/components/ui/AccessDeniedState';
import { RateLimitNotice } from '@/components/ui/RateLimitNotice';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { SettingsSkeleton } from '@/components/ui/PageSkeleton';
import { useSettings } from '../hooks/use-settings';
import { SettingsHeader } from './settings-header';
import { SettingsTabs } from './settings-tabs';
import { InfrastructurePanel } from './infrastructure-panel';
import { GeofencingPanel } from './geofencing-panel';
import { BackupPanel } from './backup-panel';
import { NetworkSettingsPanel } from './network-settings-panel';
import '@/styles/features/settings.css';

export function SettingsView() {
  const {
    activeTab,
    setActiveTab,
    settings,
    telemetry,
    loading,
    isRefreshingTelemetry,
    loadError,
    forbiddenError,
    fieldErrors,
    isSaving,
    isBackingUp,
    backupCooldownSeconds,
    hasChanges,
    changedFieldCount,
    dirtyTabs,
    errorTabs,
    isSuperAdmin,
    user,
    handleChange,
    handleResetChanges,
    handleSaveSettings,
    handleTriggerBackup,
    fetchSettings,
  } = useSettings();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      void fetchSettings(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchSettings]);

  if (forbiddenError) {
    return (
      <main id="main-content" className="settings-page">
        <AccessDeniedState
          title="Akses Pengaturan Sistem Dibatasi"
          description={forbiddenError}
          requiredRole="Super Admin"
          homeHref="/"
          variant="panel"
        />
      </main>
    );
  }

  if (loading && !settings && !loadError) {
    return <SettingsSkeleton />;
  }

  if (!settings) {
    return (
      <main id="main-content" className="settings-page">
        <SafeErrorState
          error={loadError}
          title="Konfigurasi Sistem Belum Tersedia"
          description="Konfigurasi sistem sementara belum dapat dimuat. Data Anda tetap aman, silakan coba lagi beberapa saat lagi."
          onRetry={() => void fetchSettings(true)}
          retryLabel="Coba Lagi"
          homeHref="/"
          variant="panel"
        />
      </main>
    );
  }

  return (
    <main id="main-content" className="settings-page">
      {/* Overview Command Header */}
      <SettingsHeader
        telemetry={telemetry}
        isSuperAdmin={isSuperAdmin}
        roleName={user.roleName}
        isRefreshing={isRefreshingTelemetry}
        onRefresh={() => void fetchSettings(true)}
      />

      {/* WAI-ARIA Navigation Tabs with Dirty & Validation Indicators */}
      <SettingsTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dirtyTabs={dirtyTabs}
        errorTabs={errorTabs}
      />

      <form onSubmit={handleSaveSettings} noValidate>
        <div
          role="tabpanel"
          id={`settings-tabpanel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          className="settings-tabpanel"
        >
          {/* Tab 1: Infrastruktur & Komputasi AI */}
          {activeTab === 'infrastruktur' && (
            <InfrastructurePanel
              settings={settings}
              telemetry={telemetry}
              fieldErrors={fieldErrors}
              isSuperAdmin={isSuperAdmin}
              handleChange={handleChange}
            />
          )}

          {/* Tab 2: Validasi Lapangan & Geofencing */}
          {activeTab === 'geofencing' && (
            <GeofencingPanel
              settings={settings}
              fieldErrors={fieldErrors}
              isSuperAdmin={isSuperAdmin}
              handleChange={handleChange}
            />
          )}

          {/* Tab 3: Disaster Recovery & Backup 3-2-1 */}
          {activeTab === 'backup' && (
            <>
              {backupCooldownSeconds > 0 && (
                <div className="settings-rate-limit-wrap">
                  <RateLimitNotice
                    remainingSeconds={backupCooldownSeconds}
                    message="Permintaan pencadangan data sedang dibatasi sementara"
                  />
                </div>
              )}
              <BackupPanel
                settings={settings}
                telemetry={telemetry}
                fieldErrors={fieldErrors}
                isBackingUp={isBackingUp || backupCooldownSeconds > 0}
                isSuperAdmin={isSuperAdmin}
                onTriggerBackup={handleTriggerBackup}
                handleChange={handleChange}
              />
            </>
          )}

          {/* Tab 4: Profil, Jaringan & Distribusi APK */}
          {activeTab === 'jaringan' && (
            <NetworkSettingsPanel
              settings={settings}
              fieldErrors={fieldErrors}
              isSuperAdmin={isSuperAdmin}
              handleChange={handleChange}
            />
          )}
        </div>

        {/* Unified Section Footer / Mobile Sticky Action Bar */}
        <footer
          className={`settings-save-footer ${hasChanges ? 'has-unsaved-changes' : ''}`}
          aria-live="polite"
        >
          <div className="settings-footer-copy">
            {hasChanges ? (
              <span className="settings-footer-alert">
                <span className="status-dot status-dot--warn" aria-hidden="true" />
                <span>
                  {changedFieldCount} perubahan konfigurasi belum disimpan ke server operasional.
                </span>
              </span>
            ) : (
              <span className="settings-footer-text">
                Konfigurasi tersinkronisasi penuh dengan server operasional pusat.
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Aksi simpan konfigurasi"
            className="settings-footer-actions"
          >
            <button
              type="button"
              onClick={handleResetChanges}
              disabled={loading || isSaving || !hasChanges}
              className="settings-reset-btn"
            >
              Batalkan
            </button>

            <button
              type="submit"
              disabled={!isSuperAdmin || isSaving || !hasChanges}
              className="settings-submit-btn"
            >
              {isSaving && <Icon name="refresh" size={13} className="icon-spin" />}
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}
