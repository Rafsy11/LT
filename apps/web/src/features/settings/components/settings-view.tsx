'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SettingsSkeleton } from '@/components/ui/PageSkeleton';
import { useSettings } from '../hooks/use-settings';
import { SettingsHeader } from './settings-header';
import { SettingsTabs } from './settings-tabs';
import { InfrastructurePanel } from './infrastructure-panel';
import { GeofencingPanel } from './geofencing-panel';
import { BackupPanel } from './backup-panel';
import { NetworkSettingsPanel } from './network-settings-panel';

export function SettingsView() {
  const {
    activeTab,
    setActiveTab,
    settings,
    telemetry,
    loading,
    isSaving,
    isBackingUp,
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

  if (loading && !telemetry) {
    return <SettingsSkeleton />;
  }

  return (
    <main
      className="settings-page"
      style={{ paddingBottom: '48px', maxWidth: '1600px', margin: '0 auto' }}
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
          <BackupPanel
            settings={settings}
            telemetry={telemetry}
            isBackingUp={isBackingUp}
            isSuperAdmin={isSuperAdmin}
            onTriggerBackup={handleTriggerBackup}
            handleChange={handleChange}
          />
        )}

        {/* Tab 4: Jaringan & Distribusi APK */}
        {activeTab === 'jaringan' && (
          <NetworkSettingsPanel
            settings={settings}
            isSuperAdmin={isSuperAdmin}
            handleChange={handleChange}
          />
        )}

        {/* Integrated Clean Section Footer */}
        <footer
          className="settings-save-footer"
          style={{
            marginTop: '24px',
            padding: '12px 18px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '12px' }}>
            {hasChanges ? (
              <span className="settings-footer-alert" style={{ fontWeight: 600 }}>
                ● Terdapat perubahan konfigurasi yang belum disimpan.
              </span>
            ) : (
              <span className="settings-footer-text">
                Konfigurasi tersinkronisasi penuh dengan server on-premise PostgreSQL &amp; Docker.
              </span>
            )}
          </div>

          <div role="group" aria-label="Aksi simpan konfigurasi" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              disabled={loading || isSaving || !hasChanges}
              className="settings-reset-btn"
              style={{
                cursor: !hasChanges ? 'not-allowed' : 'pointer',
                opacity: !hasChanges ? 0.6 : 1,
              }}
            >
              Reset
            </button>

            <button
              type="submit"
              disabled={!isSuperAdmin || isSaving || !hasChanges}
              className="settings-submit-btn"
              style={{
                cursor: !isSuperAdmin || !hasChanges ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
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
