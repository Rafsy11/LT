'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useToast } from '@/providers';
import { SystemSettingsInput, SystemTelemetryData, BackupSnapshotItem } from '@repo/shared';
import { fetchWithCache, getCachedData, setCachedData } from '@/lib/query-cache';

const SETTINGS_CACHE_KEY = '/api/v1/admin/settings';

interface SettingsCachePayload {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
}

export type SettingsTab = 'infrastruktur' | 'geofencing' | 'backup' | 'jaringan';

export const INITIAL_FALLBACK_SETTINGS: SystemSettingsInput = {
  companyName: 'Lintasarta Nusantara Network',
  serverTimezone: 'Asia/Jakarta',
  publicAccessMethod: 'STATIC_IP_HTTPS',
  publicDomain: 'https://ftth-ops.lintasarta.co.id',
  geofenceRadiusMeters: 100,
  locationViolationPolicy: 'SOFT_WARNING',
  blockMockLocation: true,
  minAppVersion: '1.0.0',
  aiInferenceMode: 'GPU_ACCELERATED',
  selectedAiModel: 'qwen2.5:14b-instruct',
  maxConcurrentAiQueries: 1,
  aiMemoryLimitGb: 16,
  cronSchedule: '0 2 * * *',
  compressionEncrypted: true,
  secondaryBackupTarget: 'EXTERNAL_NAS',
  secondaryStoragePath: 'nas://192.168.1.100/volume1/ftth_backups',
  apkDownloadUrl: 'https://ftth-ops.lintasarta.co.id/download/technician-latest.apk',
  otaUpdateUrl: 'https://ftth-ops.lintasarta.co.id/api/v1/ota/manifest',
};

export function useSettings() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('infrastruktur');
  const [settings, setSettings] = useState<SystemSettingsInput>(
    () => getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)?.settings ?? INITIAL_FALLBACK_SETTINGS,
  );
  const [telemetry, setTelemetry] = useState<SystemTelemetryData | null>(
    () => getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)?.telemetry ?? null,
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY),
  );
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
          const json = await res.json();
          if (!res.ok || !json.success || !json.data) {
            throw new Error(json.error?.message || 'Gagal memuat konfigurasi sistem');
          }
          return json.data as SettingsCachePayload;
        },
        { force },
      );
      setSettings(data.settings);
      setTelemetry(data.telemetry);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Menggunakan data konfigurasi fallback:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Handle form change
  const handleChange = <K extends keyof SystemSettingsInput>(
    field: K,
    value: SystemSettingsInput[K],
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Save settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
          'x-user-id': user.id,
          'x-username': user.username,
          'x-user-role': user.roleName,
          'x-user-type': user.userType,
          'x-hierarchy-level': String(user.hierarchyLevel),
        },
        body: JSON.stringify(settings),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menyimpan konfigurasi sistem');
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
    if (isBackingUp) return;
    try {
      setIsBackingUp(true);
      const res = await fetch('/api/v1/admin/settings/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-username': user.username,
          'x-user-role': user.roleName,
          'x-user-type': user.userType,
          'x-hierarchy-level': String(user.hierarchyLevel),
        },
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menjalankan backup snapshot');
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
        `Backup darurat ${newSnapshot.filename} (${newSnapshot.sizeMb} MB) berhasil dibuat dan disinkronkan ke NAS.`,
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
