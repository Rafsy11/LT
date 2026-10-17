'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  PERMISSIONS,
  ROLE_PRESETS,
  RolePreset,
  UserTypeEnum,
} from '@repo/shared';

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
  hasPermission: (permissionCode: string) => boolean;
  canCreateTicket: boolean;
  canManageTech: boolean;
  canEditRole: boolean;
  canUseAi: boolean;
  availablePresets: typeof ROLE_PRESETS;
}

const defaultUser: AuthUser = {
  id: 'usr-admin-01',
  username: 'aditya.saputra',
  fullName: 'Aditya Saputra',
  userType: 'SUPER_ADMIN',
  roleName: 'Super Admin',
  hierarchyLevel: 100,
  permissions: [PERMISSIONS.ALL],
  assignedClusters: ['Bandung Utara', 'Bandung Timur', 'Bandung Barat', 'Bandung Selatan'],
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [presetKey, setPresetKey] = useState<string>('SUPER_ADMIN');

  const user = useMemo<AuthUser>(() => {
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
  }, [presetKey]);

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
        setRolePreset: setPresetKey,
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
