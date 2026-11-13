'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useToast } from '@/providers';
import { SystemSettingsInput, SystemTelemetryData, BackupSnapshotItem } from '@repo/shared';
import { clearServiceUnavailable, notifyApiResponseError } from '@/lib/api-error';
import { fetchWithCache, getCachedData, setCachedData } from '@/lib/query-cache';

const SETTINGS_CACHE_KEY = '/api/v1/admin/settings';

interface SettingsCachePayload {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
}

export type SettingsTab = 'infrastruktur' | 'geofencing' | 'backup' | 'jaringan';

export function useSettings() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('infrastruktur');
  const [settings, setSettings] = useState<SystemSettingsInput | null>(
    () => getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)?.settings ?? null,
  );
  const [telemetry, setTelemetry] = useState<SystemTelemetryData | null>(
    () => getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)?.telemetry ?? null,
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const isSuperAdmin = user.hierarchyLevel >= 100;

  // Fetch settings & telemetry from backend service
  const fetchSettings = useCallback(async (force = false) => {
    try {
      if (!getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)) {
        setLoading(true);
      }
      const data = await fetchWithCache<SettingsCachePayload>(
        SETTINGS_CACHE_KEY,
        async () => {
          const res = await fetch(SETTINGS_CACHE_KEY);
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success || !json.data) {
            const parsed = notifyApiResponseError(
              res.status,
              json,
              'Gagal memuat konfigurasi sistem',
              { category: 'database', source: SETTINGS_CACHE_KEY },
            );
            throw new Error(parsed.message);
          }
          clearServiceUnavailable('database');
          return json.data as SettingsCachePayload;
        },
        { force },
      );
      setSettings(data.settings);
      setTelemetry(data.telemetry);
      setLoadError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat konfigurasi sistem';
      setLoadError(msg);
      showError(err);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Handle form change
  const handleChange = <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    setHasChanges(true);
  };

  // Save settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;
    if (!isSuperAdmin) {
      showError('Akses ditolak: Hanya Super Admin yang berwenang mengubah konfigurasi sistem.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal menyimpan konfigurasi sistem',
          { category: 'database', source: '/api/v1/admin/settings' },
        );
        throw new Error(parsed.message);
      }

      setSettings(json.data);
      setCachedData(SETTINGS_CACHE_KEY, { settings: json.data, telemetry });
      setHasChanges(false);
      showSuccess(
        'Konfigurasi sistem on-premise berhasil diperbarui dan dicatat pada activity_logs.',
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan pengaturan';
      showError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger manual instant backup
  const handleTriggerBackup = async () => {
    if (isBackingUp || !settings) return;
    try {
      setIsBackingUp(true);
      const res = await fetch('/api/v1/admin/settings/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal menjalankan backup snapshot',
          { category: 'service', source: '/api/v1/admin/settings/backup' },
        );
        throw new Error(parsed.message);
      }

      const newSnapshot: BackupSnapshotItem = json.data;
      if (telemetry) {
        const nextTelemetry = {
          ...telemetry,
          backupHistory: [newSnapshot, ...telemetry.backupHistory],
        };
        setTelemetry(nextTelemetry);
        setCachedData(SETTINGS_CACHE_KEY, { settings, telemetry: nextTelemetry });
      }

      showSuccess(
        `Backup darurat ${newSnapshot.filename} (${newSnapshot.sizeMb} MB) berhasil dibuat dan diarsipkan.`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menjalankan snapshot backup';
      showError(message);
    } finally {
      setIsBackingUp(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    settings,
    telemetry,
    loading,
    loadError,
    isSaving,
    isBackingUp,
    hasChanges,
    isSuperAdmin,
    user,
    handleChange,
    handleSaveSettings,
    handleTriggerBackup,
    fetchSettings,
  };
}
