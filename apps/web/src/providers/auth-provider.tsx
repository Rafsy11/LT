'use client';

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PERMISSIONS, ROLE_PRESETS, UserTypeEnum } from '@repo/shared';

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

interface AuthContextType {
  user: AuthUser;
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
  const [presetKey, setPresetKey] = useState<string>('SUPER_ADMIN');
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed && parsed.username && parsed.userType) {
          setSessionUser(parsed);
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  const handleSetRolePreset = useCallback((nextKey: string) => {
    setSessionUser(null);
    setPresetKey(nextKey);
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
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
        assignedClusters:
          authenticatedUser.assignedClusters && authenticatedUser.assignedClusters.length > 0
            ? authenticatedUser.assignedClusters
            : ['Bandung Utara', 'Bandung Timur'],
      };

      setSessionUser(resolvedUser);
      setPresetKey(authenticatedUser.userType === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'NOC_ADMIN');

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
    if (sessionUser) {
      return sessionUser;
    }
    const preset = ROLE_PRESETS[presetKey] || ROLE_PRESETS.SUPER_ADMIN;
    return {
      id: 'usr-active-session',
      username: preset.userType === 'TECHNICIAN' ? 'andi.pratama' : 'aditya.saputra',
      fullName: preset.userType === 'TECHNICIAN' ? 'Andi Pratama' : 'Aditya Saputra',
      userType: preset.userType,
      roleName: preset.name,
      hierarchyLevel: preset.hierarchyLevel,
      permissions: preset.permissions,
      assignedClusters: ['Bandung Utara', 'Bandung Timur', 'Bandung Barat', 'Bandung Selatan'],
    };
  }, [sessionUser, presetKey]);

  const hasPermission = (permissionCode: string): boolean => {
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
