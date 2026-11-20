'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useToast } from '@/providers';
import { SystemSettingsInput, SystemTelemetryData, BackupSnapshotItem } from '@repo/shared';
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown';
import { webApiClient } from '@/lib/api-client';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
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
  const backupCooldown = useRateLimitCountdown();

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
  const [loadError, setLoadError] = useState<unknown>(null);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const isSuperAdmin = user.hierarchyLevel >= 100;

  // Fetch settings & telemetry from backend service
  const fetchSettings = useCallback(
    async (force = false) => {
      try {
        setForbiddenError(null);
        if (!getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<SettingsCachePayload>(
          SETTINGS_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<SettingsCachePayload>(SETTINGS_CACHE_KEY);
            if (!json.success || !json.data) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: 'Konfigurasi sistem belum dapat dimuat saat ini.',
              });
            }
            return json.data;
          },
          { force },
        );
        setSettings(data.settings);
        setTelemetry(data.telemetry);
        setLoadError(null);
      } catch (err: unknown) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: 'Konfigurasi sistem belum dapat dimuat saat ini.',
        });
        if (normalized.category === 'FORBIDDEN') {
          setForbiddenError(normalized.message);
        } else {
          setLoadError(normalized);
          showError(normalized, {
            onRetry:
              normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
                ? () => void fetchSettings(true)
                : undefined,
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchSettings();
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
      showError({
        code: 'FORBIDDEN',
        message: 'Hanya Super Admin yang memiliki izin untuk mengubah konfigurasi sistem.',
      });
      return;
    }

    try {
      setIsSaving(true);
      const json = await webApiClient.put<SystemSettingsInput>(
        '/api/v1/admin/settings',
        settings,
      );

      if (!json.success || !json.data) {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Konfigurasi sistem belum dapat disimpan.',
        });
      }

      setSettings(json.data);
      setCachedData(SETTINGS_CACHE_KEY, { settings: json.data, telemetry });
      setHasChanges(false);
      showSuccess('Konfigurasi sistem berhasil diperbarui dan tercatat pada riwayat audit.');
    } catch (err: unknown) {
      showError(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger manual instant backup
  const handleTriggerBackup = async () => {
    if (isBackingUp || backupCooldown.isLimited || !settings) return;
    try {
      setIsBackingUp(true);
      const json = await webApiClient.post<BackupSnapshotItem>(
        '/api/v1/admin/settings/backup',
        {},
        { timeoutMs: 30_000 },
      );

      if (!json.success || !json.data) {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Proses pencadangan data belum dapat dijalankan saat ini.',
        });
      }

      const newSnapshot = json.data;
      if (telemetry) {
        const nextTelemetry = {
          ...telemetry,
          backupHistory: [newSnapshot, ...telemetry.backupHistory],
        };
        setTelemetry(nextTelemetry);
        setCachedData(SETTINGS_CACHE_KEY, { settings, telemetry: nextTelemetry });
      }

      showSuccess(
        `Cadangan data ${newSnapshot.filename} (${newSnapshot.sizeMb} MB) berhasil dibuat dan diarsipkan.`,
      );
    } catch (err: unknown) {
      if (isAppError(err) && err.category === 'RATE_LIMITED' && err.retryAfterSeconds) {
        backupCooldown.startCooldown(err.retryAfterSeconds);
      }
      showError(err);
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
    forbiddenError,
    isSaving,
    isBackingUp,
    backupCooldownSeconds: backupCooldown.remainingSeconds,
    hasChanges,
    isSuperAdmin,
    user,
    handleChange,
    handleSaveSettings,
    handleTriggerBackup,
    fetchSettings,
  };
}
