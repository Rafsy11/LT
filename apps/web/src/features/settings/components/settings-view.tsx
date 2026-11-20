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
    loadError,
    forbiddenError,
    isSaving,
    isBackingUp,
    backupCooldownSeconds,
    hasChanges,
    isSuperAdmin,
    user,
    handleChange,
    handleSaveSettings,
    handleTriggerBackup,
    fetchSettings,
  } = useSettings();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchSettings(true);
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
    <main
      id="main-content"
      className="settings-page"
    >
      {/* Overview Command Header */}
      <SettingsHeader
        isSuperAdmin={isSuperAdmin}
        roleName={user.roleName}
        isSaving={isSaving}
        hasChanges={hasChanges}
        onSave={() => handleSaveSettings()}
      />

      {/* Modern Hairline Navigation Tabs */}
      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <form onSubmit={handleSaveSettings}>
        {/* Tab 1: Infrastruktur & Komputasi AI */}
        {activeTab === 'infrastruktur' && (
          <InfrastructurePanel
            settings={settings}
            telemetry={telemetry}
            isSuperAdmin={isSuperAdmin}
            handleChange={handleChange}
          />
        )}

        {/* Tab 2: Validasi Lapangan & Geofencing */}
        {activeTab === 'geofencing' && (
          <GeofencingPanel
            settings={settings}
            isSuperAdmin={isSuperAdmin}
            handleChange={handleChange}
          />
        )}

        {/* Tab 3: Disaster Recovery & Backup 3-2-1 */}
        {activeTab === 'backup' && (
          <>
            {backupCooldownSeconds > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <RateLimitNotice
                  remainingSeconds={backupCooldownSeconds}
                  message="Permintaan pencadangan data sedang dibatasi sementara"
                />
              </div>
            )}
            <BackupPanel
              settings={settings}
              telemetry={telemetry}
              isBackingUp={isBackingUp || backupCooldownSeconds > 0}
              isSuperAdmin={isSuperAdmin}
              onTriggerBackup={handleTriggerBackup}
              handleChange={handleChange}
            />
          </>
        )}

        {/* Tab 4: Jaringan & Distribusi APK */}
        {activeTab === 'jaringan' && (
          <NetworkSettingsPanel
            settings={settings}
            isSuperAdmin={isSuperAdmin}
            handleChange={handleChange}
          />
        )}

        {/* Integrated Clean Section Footer / Mobile Sticky Action Bar */}
        <footer
          className={`settings-save-footer ${hasChanges ? 'has-unsaved-changes' : ''}`}
        >
          <div className="settings-footer-copy">
            {hasChanges ? (
              <span className="settings-footer-alert">
                ● Terdapat perubahan konfigurasi yang belum disimpan.
              </span>
            ) : (
              <span className="settings-footer-text">
                Konfigurasi tersinkronisasi penuh dengan server operasional pusat.
              </span>
            )}
          </div>

          <div role="group" aria-label="Aksi simpan konfigurasi" className="settings-footer-actions">
            <button
              type="button"
              onClick={() => window.location.reload()}
              disabled={loading || isSaving || !hasChanges}
              className="settings-reset-btn"
            >
              Reset
            </button>

            <button
              type="submit"
              disabled={!isSuperAdmin || isSaving || !hasChanges}
              className="settings-submit-btn"
            >
              {isSaving && <Icon name="refresh" size={13} className="spin" />}
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}
