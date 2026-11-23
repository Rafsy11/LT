'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useToast } from '@/providers';
import { SystemSettingsInput, SystemTelemetryData, BackupSnapshotItem } from '@repo/shared';
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown';
import { webApiClient } from '@/lib/api-client';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
import { fetchWithCache, getCachedData, setCachedData } from '@/lib/query-cache';

const SETTINGS_CACHE_KEY = '/api/v1/admin/settings';
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CRON_FIVE_PART_RE = /^\S+(\s+\S+){4}$/;
const MIN_GEOFENCE_METERS = 10;
const MAX_GEOFENCE_METERS = 1000;
const MIN_AI_MEMORY_GB = 4;
const MAX_AI_MEMORY_GB = 64;
const MIN_AI_CONCURRENCY = 1;
const MAX_AI_CONCURRENCY = 4;

interface SettingsCachePayload {
  settings: SystemSettingsInput;
  telemetry: SystemTelemetryData | null;
}

export type SettingsTab = 'infrastruktur' | 'geofencing' | 'backup' | 'jaringan';
export type SettingsFieldErrors = Partial<Record<keyof SystemSettingsInput, string>>;

const SETTINGS_TAB_ORDER: readonly SettingsTab[] = [
  'infrastruktur',
  'geofencing',
  'backup',
  'jaringan',
];

const SETTINGS_TAB_FIELDS: Record<SettingsTab, ReadonlyArray<keyof SystemSettingsInput>> = {
  infrastruktur: [
    'aiInferenceMode',
    'selectedAiModel',
    'maxConcurrentAiQueries',
    'aiMemoryLimitGb',
  ],
  geofencing: [
    'geofenceRadiusMeters',
    'locationViolationPolicy',
    'blockMockLocation',
    'minAppVersion',
  ],
  backup: [
    'cronSchedule',
    'compressionEncrypted',
    'secondaryBackupTarget',
    'secondaryStoragePath',
  ],
  jaringan: [
    'companyName',
    'publicAccessMethod',
    'publicDomain',
    'serverTimezone',
    'apkDownloadUrl',
    'otaUpdateUrl',
  ],
};

function isValidOptionalEndpointUrl(value: string | undefined): boolean {
  if (!value || !value.trim()) return true;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  );
}

function validateSystemSettings(draft: SystemSettingsInput): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  if (!draft.companyName || draft.companyName.trim().length < 2) {
    errors.companyName = 'Nama perusahaan atau instansi minimal 2 karakter.';
  }

  if (!draft.publicDomain || draft.publicDomain.trim().length < 3) {
    errors.publicDomain = 'Domain atau URL sistem operasional minimal 3 karakter.';
  }

  if (
    !Number.isInteger(draft.geofenceRadiusMeters) ||
    draft.geofenceRadiusMeters < MIN_GEOFENCE_METERS ||
    draft.geofenceRadiusMeters > MAX_GEOFENCE_METERS
  ) {
    errors.geofenceRadiusMeters = `Radius geofencing harus bilangan bulat antara ${MIN_GEOFENCE_METERS} hingga ${MAX_GEOFENCE_METERS} meter.`;
  }

  if (!SEMVER_RE.test((draft.minAppVersion || '').trim())) {
    errors.minAppVersion = 'Gunakan format versi semver yang valid, contoh: 1.0.0.';
  }

  if (
    !Number.isInteger(draft.aiMemoryLimitGb) ||
    draft.aiMemoryLimitGb < MIN_AI_MEMORY_GB ||
    draft.aiMemoryLimitGb > MAX_AI_MEMORY_GB
  ) {
    errors.aiMemoryLimitGb = `Alokasi memori AI harus antara ${MIN_AI_MEMORY_GB} hingga ${MAX_AI_MEMORY_GB} GB.`;
  }

  if (
    !Number.isInteger(draft.maxConcurrentAiQueries) ||
    draft.maxConcurrentAiQueries < MIN_AI_CONCURRENCY ||
    draft.maxConcurrentAiQueries > MAX_AI_CONCURRENCY
  ) {
    errors.maxConcurrentAiQueries = `Antrean paralel AI harus antara ${MIN_AI_CONCURRENCY} hingga ${MAX_AI_CONCURRENCY} proses.`;
  }

  if (!CRON_FIVE_PART_RE.test((draft.cronSchedule || '').trim())) {
    errors.cronSchedule = 'Jadwal cron harus terdiri dari 5 kolom, contoh: 0 2 * * *.';
  }

  if (!draft.secondaryStoragePath || draft.secondaryStoragePath.trim().length < 3) {
    errors.secondaryStoragePath = 'Path penyimpanan cadangan minimal 3 karakter.';
  }

  if (!isValidOptionalEndpointUrl(draft.apkDownloadUrl)) {
    errors.apkDownloadUrl = 'URL unduh APK harus diawali https://, http://, atau /.';
  }

  if (!isValidOptionalEndpointUrl(draft.otaUpdateUrl)) {
    errors.otaUpdateUrl = 'URL manifest OTA harus diawali https://, http://, atau /.';
  }

  return errors;
}

export function useSettings() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const backupCooldown = useRateLimitCountdown();

  const initialCache = getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY);

  const [activeTab, setActiveTab] = useState<SettingsTab>('infrastruktur');
  const [settings, setSettings] = useState<SystemSettingsInput | null>(
    () => initialCache?.settings ?? null,
  );
  const [savedSettings, setSavedSettings] = useState<SystemSettingsInput | null>(
    () => initialCache?.settings ?? null,
  );
  const [telemetry, setTelemetry] = useState<SystemTelemetryData | null>(
    () => initialCache?.telemetry ?? null,
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCache);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const isSuperAdmin = user.hierarchyLevel >= 100;

  // Fetch settings & telemetry from backend service
  const fetchSettings = useCallback(
    async (force = false) => {
      try {
        setForbiddenError(null);
        if (!getCachedData<SettingsCachePayload>(SETTINGS_CACHE_KEY)) {
          setLoading(true);
        } else if (force) {
          setIsRefreshingTelemetry(true);
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
        setSavedSettings(data.settings);
        setTelemetry(data.telemetry);
        setFieldErrors({});
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
        setIsRefreshingTelemetry(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const changedFields = useMemo(() => {
    const changed = new Set<keyof SystemSettingsInput>();
    if (!settings || !savedSettings) return changed;
    const keys = Object.keys(settings) as Array<keyof SystemSettingsInput>;
    for (const key of keys) {
      if (settings[key] !== savedSettings[key]) {
        changed.add(key);
      }
    }
    return changed;
  }, [settings, savedSettings]);

  const hasChanges = changedFields.size > 0;
  const changedFieldCount = changedFields.size;

  const dirtyTabs = useMemo(() => {
    const next = new Set<SettingsTab>();
    for (const tab of SETTINGS_TAB_ORDER) {
      if (SETTINGS_TAB_FIELDS[tab].some((field) => changedFields.has(field))) {
        next.add(tab);
      }
    }
    return next;
  }, [changedFields]);

  const errorTabs = useMemo(() => {
    const next = new Set<SettingsTab>();
    for (const tab of SETTINGS_TAB_ORDER) {
      if (SETTINGS_TAB_FIELDS[tab].some((field) => Boolean(fieldErrors[field]))) {
        next.add(tab);
      }
    }
    return next;
  }, [fieldErrors]);

  // Handle form change
  const handleChange = useCallback(
    <K extends keyof SystemSettingsInput>(field: K, value: SystemSettingsInput[K]) => {
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  // Revert unsaved changes in state without reloading the page
  const handleResetChanges = useCallback(() => {
    if (!savedSettings) return;
    setSettings({ ...savedSettings });
    setFieldErrors({});
  }, [savedSettings]);

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

    const validationErrors = validateSystemSettings(settings);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      const firstErrorTab = SETTINGS_TAB_ORDER.find((tab) =>
        SETTINGS_TAB_FIELDS[tab].some((field) => Boolean(validationErrors[field])),
      );
      if (firstErrorTab) {
        setActiveTab(firstErrorTab);
      }
      showError({
        code: 'VALIDATION_ERROR',
        message: 'Periksa kembali isian konfigurasi yang ditandai sebelum menyimpan.',
      });
      return;
    }

    try {
      setIsSaving(true);
      const normalizedPayload: SystemSettingsInput = {
        ...settings,
        companyName: settings.companyName.trim(),
        publicDomain: settings.publicDomain.trim(),
        minAppVersion: settings.minAppVersion.trim(),
        cronSchedule: settings.cronSchedule.trim(),
        secondaryStoragePath: settings.secondaryStoragePath.trim(),
        apkDownloadUrl: settings.apkDownloadUrl?.trim() || undefined,
        otaUpdateUrl: settings.otaUpdateUrl?.trim() || undefined,
      };
      const json = await webApiClient.put<SystemSettingsInput>(
        '/api/v1/admin/settings',
        normalizedPayload,
      );

      if (!json.success || !json.data) {
        throw normalizeAppError(!json.success ? json.error : null, {
          fallbackMessage: 'Konfigurasi sistem belum dapat disimpan.',
        });
      }

      setSettings(json.data);
      setSavedSettings(json.data);
      setFieldErrors({});
      setCachedData(SETTINGS_CACHE_KEY, { settings: json.data, telemetry });
      showSuccess('Konfigurasi sistem berhasil diperbarui dan tercatat pada riwayat audit.');
    } catch (err: unknown) {
      if (isAppError(err) && err.fieldErrors) {
        const mapped = err.fieldErrors as SettingsFieldErrors;
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
        const firstErrorTab = SETTINGS_TAB_ORDER.find((tab) =>
          SETTINGS_TAB_FIELDS[tab].some((field) => Boolean(mapped[field])),
        );
        if (firstErrorTab) {
          setActiveTab(firstErrorTab);
        }
      }
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
        setCachedData(SETTINGS_CACHE_KEY, {
          settings: savedSettings || settings,
          telemetry: nextTelemetry,
        });
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
    isRefreshingTelemetry,
    loadError,
    forbiddenError,
    fieldErrors,
    isSaving,
    isBackingUp,
    backupCooldownSeconds: backupCooldown.remainingSeconds,
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
  };
}
