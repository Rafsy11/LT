'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import type { TechnicianListItem } from '@repo/shared';
import { STANDARD_ERROR_MESSAGES } from '@repo/shared';
import type { TechnicianFilterTab } from '../components/technician-filters';
import { webApiClient } from '@/lib/api-client';
import { normalizeAppError } from '@/lib/error-normalizer';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';
import {
  matchesTechnicianCluster,
  matchesTechnicianSearch,
  type TechnicianModalIntent,
} from '../utils/technician-session';

const TECHNICIANS_CACHE_KEY = '/api/v1/admin/technicians';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';
const DEFAULT_FORCE_LOGOUT_REASON = 'Admin Force Logout (Sesi Dicabut)';

export function useTechnicians() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [activeTab, setActiveTab] = useState<TechnicianFilterTab>('all');
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>(
    () => getCachedData<TechnicianListItem[]>(TECHNICIANS_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !getCachedData<TechnicianListItem[]>(TECHNICIANS_CACHE_KEY),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const [selectedTechKey, setSelectedTechKey] = useState<string | null>(null);
  const [modalIntent, setModalIntent] = useState<TechnicianModalIntent>('inspect');

  const actionLockRef = useRef<boolean>(false);

  const { canManageTech } = useAuth();
  const { showSuccess, showError } = useToast();

  const fetchTechs = useCallback(
    async (force = false) => {
      try {
        setLoadError(null);
        if (!getCachedData<TechnicianListItem[]>(TECHNICIANS_CACHE_KEY)) {
          setLoading(true);
        } else if (force) {
          setIsRefreshing(true);
        }

        const data = await fetchWithCache<TechnicianListItem[]>(
          TECHNICIANS_CACHE_KEY,
          async () => {
            const json = await webApiClient.get<TechnicianListItem[]>(TECHNICIANS_CACHE_KEY);
            if (!json.success || !Array.isArray(json.data)) {
              throw normalizeAppError(!json.success ? json.error : null, {
                fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
              });
            }
            return json.data;
          },
          { force },
        );
        setTechnicians(data);
      } catch (err: unknown) {
        const normalized = normalizeAppError(err, {
          fallbackMessage: STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED,
        });
        setLoadError(normalized.message);
        showError(normalized, {
          onRetry:
            normalized.category === 'TIMEOUT' || normalized.category === 'OFFLINE'
              ? () => void fetchTechs(true)
              : undefined,
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchTechs();
  }, [fetchTechs]);

  // Always derive selected technician from the latest list so modal state never goes stale
  const selectedTech = useMemo(() => {
    if (!selectedTechKey) return null;
    return (
      technicians.find((t) => t.id === selectedTechKey || t.username === selectedTechKey) ?? null
    );
  }, [technicians, selectedTechKey]);

  const openTechModal = useCallback(
    (tech: TechnicianListItem, intent: TechnicianModalIntent = 'inspect') => {
      setSelectedTechKey(tech.id || tech.username);
      setModalIntent(intent);
    },
    [],
  );

  const closeTechModal = useCallback(() => {
    setSelectedTechKey(null);
    setModalIntent('inspect');
  }, []);

  /**
   * Instant Session Revocation (Force Logout) guarded by `tech:manage` permission.
   */
  const handleForceLogout = useCallback(
    async (usernameOrId: string, reason?: string): Promise<boolean> => {
      if (!canManageTech) {
        showError({
          code: 'FORBIDDEN',
          message: 'Akun Anda belum memiliki izin untuk mencabut sesi perangkat teknisi.',
        });
        return false;
      }

      if (actionLockRef.current) return false;
      actionLockRef.current = true;
      setProcessingUser(usernameOrId);

      try {
        const sanitizedReason = reason?.trim() || DEFAULT_FORCE_LOGOUT_REASON;
        const json = await webApiClient.post(
          `/api/v1/admin/technicians/${encodeURIComponent(usernameOrId)}/force-logout`,
          { reason: sanitizedReason },
        );

        if (json.success) {
          showSuccess(`Sesi perangkat teknisi @${usernameOrId} berhasil dicabut.`);
          invalidateQueryCache(TECHNICIANS_CACHE_KEY, OVERVIEW_CACHE_KEY);
          await fetchTechs(true);
          return true;
        }
        showError(json.error);
        return false;
      } catch (e: unknown) {
        showError(e);
        return false;
      } finally {
        actionLockRef.current = false;
        setProcessingUser(null);
      }
    },
    [canManageTech, fetchTechs, showError, showSuccess],
  );

  /**
   * Toggles account active status (Lock / Unlock account) with optional audit reason.
   */
  const handleToggleAccount = useCallback(
    async (usernameOrId: string, reason?: string): Promise<boolean> => {
      if (!canManageTech) {
        showError({
          code: 'FORBIDDEN',
          message: 'Akun Anda belum memiliki izin untuk mengubah status akun teknisi.',
        });
        return false;
      }

      if (actionLockRef.current) return false;
      actionLockRef.current = true;
      setProcessingUser(usernameOrId);

      try {
        const payload: { reason?: string } = {};
        if (reason?.trim()) {
          payload.reason = reason.trim();
        }
        const json = await webApiClient.post(
          `/api/v1/admin/technicians/${encodeURIComponent(usernameOrId)}/toggle`,
          payload,
        );

        if (json.success) {
          showSuccess(`Status akun teknisi @${usernameOrId} berhasil diperbarui.`);
          invalidateQueryCache(TECHNICIANS_CACHE_KEY, OVERVIEW_CACHE_KEY);
          await fetchTechs(true);
          return true;
        }
        showError(json.error);
        return false;
      } catch (e: unknown) {
        showError(e);
        return false;
      } finally {
        actionLockRef.current = false;
        setProcessingUser(null);
      }
    },
    [canManageTech, fetchTechs, showError, showSuccess],
  );

  const clusterScoped = useMemo(() => {
    return technicians.filter(
      (t) => matchesTechnicianCluster(t, cluster) && matchesTechnicianSearch(t, search),
    );
  }, [technicians, cluster, search]);

  const counts = useMemo(() => {
    let activeSessions = 0;
    let busy = 0;
    let revoked = 0;
    let disabled = 0;

    for (const tech of clusterScoped) {
      if (tech.isActive && tech.sessionStatus === 'ACTIVE_SESSION') activeSessions += 1;
      if (tech.activeTicketsCount > 0) busy += 1;
      if (tech.isActive && tech.sessionStatus === 'REVOKED') revoked += 1;
      if (!tech.isActive) disabled += 1;
    }

    return { activeSessions, busy, revoked, disabled };
  }, [clusterScoped]);

  const displayedTechs = useMemo(() => {
    switch (activeTab) {
      case 'active_session':
        return clusterScoped.filter((t) => t.isActive && t.sessionStatus === 'ACTIVE_SESSION');
      case 'busy':
        return clusterScoped.filter((t) => t.activeTicketsCount > 0);
      case 'revoked':
        return clusterScoped.filter((t) => t.isActive && t.sessionStatus === 'REVOKED');
      case 'inactive':
        return clusterScoped.filter((t) => !t.isActive);
      case 'all':
      default:
        return clusterScoped;
    }
  }, [clusterScoped, activeTab]);

  return {
    search,
    setSearch,
    cluster,
    setCluster,
    activeTab,
    setActiveTab,
    technicians,
    loading,
    isRefreshing,
    loadError,
    processingUser,
    selectedTech,
    modalIntent,
    openTechModal,
    closeTechModal,
    canManageTech,
    fetchTechs,
    handleForceLogout,
    handleToggleAccount,
    clusterScoped,
    activeSessionsCount: counts.activeSessions,
    busyCount: counts.busy,
    revokedCount: counts.revoked,
    disabledCount: counts.disabled,
    displayedTechs,
  };
}
