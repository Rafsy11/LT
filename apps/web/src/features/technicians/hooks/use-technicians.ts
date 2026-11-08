'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import type { TechnicianListItem } from '@repo/shared';
import type { TechnicianFilterTab } from '../components/technician-filters';
import { fetchWithCache, getCachedData, invalidateQueryCache } from '@/lib/query-cache';

const TECHNICIANS_CACHE_KEY = '/api/v1/admin/technicians';
const OVERVIEW_CACHE_KEY = '/api/v1/admin/overview';

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
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState<TechnicianListItem | null>(null);

  const actionLockRef = useRef<boolean>(false);

  const { canManageTech } = useAuth();
  const { showSuccess, showError } = useToast();

  const fetchTechs = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<TechnicianListItem[]>(TECHNICIANS_CACHE_KEY)) {
          setLoading(true);
        }
        const data = await fetchWithCache<TechnicianListItem[]>(
          TECHNICIANS_CACHE_KEY,
          async () => {
            const res = await fetch(TECHNICIANS_CACHE_KEY);
            const json = await res.json();
            if (!res.ok || !json.success || !Array.isArray(json.data)) {
              throw new Error(json.error?.message || 'Gagal memuat daftar teknisi');
            }
            return json.data as TechnicianListItem[];
          },
          { force },
        );
        setTechnicians(data);
      } catch (err: unknown) {
        showError(err);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    fetchTechs();
  }, [fetchTechs]);

  /**
   * Instant Session Revocation (Force Logout) - PRD Section 2.2 & agent.md Law 4.
   * Debounced with 1-ms action lock & guarded by `tech:manage` permission.
   */
  const handleForceLogout = useCallback(
    async (usernameOrId: string) => {
      if (!canManageTech) {
        showError({
          code: 'FORBIDDEN',
          message:
            'Akses Ditolak: Anda tidak memiliki izin tech:manage untuk melakukan Force Logout teknisi.',
        });
        return;
      }

      if (actionLockRef.current) return;
      actionLockRef.current = true;
      setProcessingUser(usernameOrId);

      try {
        const res = await fetch(`/api/v1/admin/technicians/${usernameOrId}/force-logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Admin Force Logout (Sesi Dicabut)' }),
        });
        const json = await res.json();

        if (json.success) {
          showSuccess(json.message || `Sesi perangkat teknisi ${usernameOrId} berhasil dicabut.`);
          invalidateQueryCache(TECHNICIANS_CACHE_KEY, OVERVIEW_CACHE_KEY);
          await fetchTechs(true);

          // Update modal state if open
          if (
            selectedTech &&
            (selectedTech.username === usernameOrId || selectedTech.id === usernameOrId)
          ) {
            setSelectedTech((prev) =>
              prev
                ? {
                    ...prev,
                    sessionStatus: 'REVOKED',
                    lastActiveAt: 'Baru saja dicabut oleh Admin',
                  }
                : null,
            );
          }
        } else {
          showError(json.error);
        }
      } catch (e: unknown) {
        showError(e);
      } finally {
        actionLockRef.current = false;
        setProcessingUser(null);
      }
    },
    [canManageTech, fetchTechs, selectedTech, showError, showSuccess],
  );

  /**
   * Toggles account active status (Lock / Unlock account).
   */
  const handleToggleAccount = useCallback(
    async (usernameOrId: string) => {
      if (!canManageTech) {
        showError({
          code: 'FORBIDDEN',
          message:
            'Akses Ditolak: Anda tidak memiliki izin tech:manage untuk mengubah status akun teknisi.',
        });
        return;
      }

      if (actionLockRef.current) return;
      actionLockRef.current = true;
      setProcessingUser(usernameOrId);

      try {
        const res = await fetch(`/api/v1/admin/technicians/${usernameOrId}/toggle`, {
          method: 'POST',
        });
        const json = await res.json();

        if (json.success) {
          showSuccess(json.message || `Status akun teknisi ${usernameOrId} berhasil diperbarui.`);
          invalidateQueryCache(TECHNICIANS_CACHE_KEY, OVERVIEW_CACHE_KEY);
          await fetchTechs(true);

          if (
            selectedTech &&
            (selectedTech.username === usernameOrId || selectedTech.id === usernameOrId)
          ) {
            setSelectedTech((prev) => (prev ? { ...prev, isActive: !prev.isActive } : null));
          }
        } else {
          showError(json.error);
        }
      } catch (e: unknown) {
        showError(e);
      } finally {
        actionLockRef.current = false;
        setProcessingUser(null);
      }
    },
    [canManageTech, fetchTechs, selectedTech, showError, showSuccess],
  );

  // Scoped by Cluster & Search
  const clusterScoped = useMemo(() => {
    return technicians.filter((t) => {
      const matchesCluster =
        cluster === 'Semua cluster' ||
        t.cluster.toLowerCase().includes(cluster.toLowerCase().replace('bandung ', ''));
      const matchesSearch =
        search === '' ||
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        t.username.toLowerCase().includes(search.toLowerCase()) ||
        t.cluster.toLowerCase().includes(search.toLowerCase()) ||
        (t.deviceId && t.deviceId.toLowerCase().includes(search.toLowerCase()));
      return matchesCluster && matchesSearch;
    });
  }, [technicians, cluster, search]);

  // Telemetry Counts
  const activeSessionsCount = useMemo(
    () => clusterScoped.filter((t) => t.sessionStatus === 'ACTIVE_SESSION').length,
    [clusterScoped],
  );
  const busyCount = useMemo(
    () => clusterScoped.filter((t) => t.activeTicketsCount > 0).length,
    [clusterScoped],
  );
  const revokedCount = useMemo(
    () => clusterScoped.filter((t) => t.sessionStatus === 'REVOKED').length,
    [clusterScoped],
  );
  const disabledCount = useMemo(
    () => clusterScoped.filter((t) => !t.isActive).length,
    [clusterScoped],
  );

  // Tab Filtering
  const displayedTechs = useMemo(() => {
    switch (activeTab) {
      case 'active_session':
        return clusterScoped.filter((t) => t.sessionStatus === 'ACTIVE_SESSION');
      case 'busy':
        return clusterScoped.filter((t) => t.activeTicketsCount > 0);
      case 'revoked':
        return clusterScoped.filter((t) => t.sessionStatus === 'REVOKED');
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
    processingUser,
    selectedTech,
    setSelectedTech,
    canManageTech,
    fetchTechs,
    handleForceLogout,
    handleToggleAccount,
    clusterScoped,
    activeSessionsCount,
    busyCount,
    revokedCount,
    disabledCount,
    displayedTechs,
  };
}
