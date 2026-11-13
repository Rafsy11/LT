'use client';

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PERMISSIONS, ROLE_PRESETS, UserTypeEnum } from '@repo/shared';
import { clearServiceUnavailable, notifyApiResponseError } from '@/lib/api-error';

const AUTH_STORAGE_KEY = 'fiberops_auth_user';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  userType: UserTypeEnum;
  roleName: string;
  hierarchyLevel: number;
  permissions: string[];
  assignedClusters: string[];
}

const UNAUTHENTICATED_USER: AuthUser = {
  id: '',
  username: '',
  fullName: 'Memuat Sesi...',
  userType: 'ADMIN',
  roleName: 'Memverifikasi...',
  hierarchyLevel: 99,
  permissions: [],
  assignedClusters: [],
};

interface AuthContextType {
  user: AuthUser;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  currentPresetKey: string;
  setRolePreset: (presetKey: string) => void;
  loginUser: (
    authenticatedUser: Partial<AuthUser> & {
      username: string;
      userType: UserTypeEnum;
      role?: string;
    },
  ) => void;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  hasPermission: (permissionCode: string) => boolean;
  canCreateTicket: boolean;
  canManageTech: boolean;
  canEditRole: boolean;
  canUseAi: boolean;
  availablePresets: typeof ROLE_PRESETS;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [presetKey, setPresetKey] = useState<string>('ADMIN');
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    let active = true;

    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed && parsed.username && parsed.userType) {
          setSessionUser(parsed);
          setPresetKey(parsed.userType);
        }
      }
    } catch {
      // Ignore storage read errors
    }

    const hydrateLiveSession = async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!active) return;

        if (res.status === 503) {
          notifyApiResponseError(
            res.status,
            json,
            'Koneksi database PostgreSQL terputus saat memverifikasi sesi operator.',
            { category: 'database', source: '/api/v1/auth/me' },
          );
          return;
        }

        if (res.status === 401 || res.status === 403) {
          setSessionUser(null);
          try {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
            window.localStorage.removeItem('fiberops_access_token');
          } catch {
            // Ignore storage errors
          }

          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            const currentPath = window.location.pathname;
            window.location.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
          }
          return;
        }

        if (res.ok && json?.success && json.data?.user) {
          const liveUser = json.data.user as {
            id: string;
            username: string;
            fullName: string;
            userType: UserTypeEnum;
            role?: string;
            roleName?: string;
            hierarchyLevel: number;
            permissions?: string[];
            assignedClusters?: string[];
          };

          const hydrated: AuthUser = {
            id: liveUser.id,
            username: liveUser.username,
            fullName: liveUser.fullName,
            userType: liveUser.userType,
            roleName: liveUser.roleName || liveUser.role || 'Operator NOC',
            hierarchyLevel: liveUser.hierarchyLevel ?? 2,
            permissions: Array.isArray(liveUser.permissions) ? liveUser.permissions : [],
            assignedClusters: Array.isArray(liveUser.assignedClusters)
              ? liveUser.assignedClusters
              : [],
          };

          setSessionUser(hydrated);
          setPresetKey(hydrated.userType);
          clearServiceUnavailable('database');

          try {
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(hydrated));
          } catch {
            // Ignore storage write errors
          }
        }
      } catch {
        // Network failure during silent mount hydration
      } finally {
        if (active) {
          setIsAuthLoading(false);
        }
      }
    };

    void hydrateLiveSession();
    return () => {
      active = false;
    };
  }, []);

  const handleSetRolePreset = useCallback((nextKey: string) => {
    setPresetKey(nextKey);
  }, []);

  const loginUser = useCallback(
    (
      authenticatedUser: Partial<AuthUser> & {
        username: string;
        userType: UserTypeEnum;
        role?: string;
      },
    ) => {
      const fallbackPreset =
        authenticatedUser.userType === 'SUPER_ADMIN'
          ? ROLE_PRESETS.SUPER_ADMIN
          : authenticatedUser.userType === 'TECHNICIAN'
            ? ROLE_PRESETS.TECHNICIAN
            : ROLE_PRESETS.NOC_ADMIN;

      const resolvedUser: AuthUser = {
        id: authenticatedUser.id || 'usr-active-session',
        username: authenticatedUser.username,
        fullName: authenticatedUser.fullName || authenticatedUser.username,
        userType: authenticatedUser.userType,
        roleName: authenticatedUser.roleName || authenticatedUser.role || fallbackPreset.name,
        hierarchyLevel: authenticatedUser.hierarchyLevel ?? fallbackPreset.hierarchyLevel,
        permissions:
          authenticatedUser.permissions && authenticatedUser.permissions.length > 0
            ? authenticatedUser.permissions
            : fallbackPreset.permissions,
        assignedClusters: Array.isArray(authenticatedUser.assignedClusters)
          ? authenticatedUser.assignedClusters
          : [],
      };

      setSessionUser(resolvedUser);
      setIsAuthLoading(false);
      setPresetKey(
        authenticatedUser.userType === 'SUPER_ADMIN'
          ? 'SUPER_ADMIN'
          : authenticatedUser.userType === 'TECHNICIAN'
            ? 'TECHNICIAN'
            : 'NOC_ADMIN',
      );

      try {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(resolvedUser));
      } catch {
        // Ignore storage write errors
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Proceed with client cleanup even if network call fails
    } finally {
      setSessionUser(null);
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem('fiberops_access_token');
      } catch {
        // Ignore storage errors
      }
      setIsLoggingOut(false);
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  const user = useMemo<AuthUser>(() => {
    return sessionUser || UNAUTHENTICATED_USER;
  }, [sessionUser]);

  const hasPermission = (permissionCode: string): boolean => {
    if (!sessionUser) return false;
    if (user.permissions.includes(PERMISSIONS.ALL)) return true;
    return user.permissions.includes(permissionCode);
  };

  const canCreateTicket = hasPermission(PERMISSIONS.TICKET_CREATE);
  const canManageTech = hasPermission(PERMISSIONS.TECH_MANAGE);
  const canEditRole = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canUseAi = hasPermission(PERMISSIONS.AI_USE);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthLoading,
        isAuthenticated: Boolean(sessionUser?.id),
        currentPresetKey: presetKey,
        setRolePreset: handleSetRolePreset,
        loginUser,
        logout,
        isLoggingOut,
        hasPermission,
        canCreateTicket,
        canManageTech,
        canEditRole,
        canUseAi,
        availablePresets: ROLE_PRESETS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/**
 * PermissionGate: Declarative component for conditional rendering based on Permission Matrix (Requirement 3).
 * Renders children only if current user has the required permission code.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (hasPermission(permission)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
