'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AdminUserItem } from '@repo/shared';
import { useAuth, useToast } from '@/providers';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { clearServiceUnavailable, notifyApiResponseError } from '@/lib/api-error';
import { fetchWithCache, getCachedData, invalidateQueryCache, setCachedData } from '@/lib/query-cache';

const ROLES_CACHE_KEY = '/api/v1/admin/roles';
const USERS_CACHE_KEY = '/api/v1/admin/users';

export interface RoleApiItem {
  id: string;
  name: string;
  permissions: string[];
  hierarchyLevel: number;
  _count?: { users: number };
}

export interface PermissionDefinition {
  code: string;
  label: string;
  description: string;
  category: string;
}

export interface UserAccessItem {
  id: string;
  nik?: string;
  name: string;
  email: string;
  username: string;
  role: string;
  cluster: string;
  assignedClusters: string[];
  vendorCompany?: string;
  isActive: boolean;
  lastActive: string;
  telegramChatId?: string | null;
}

function mapAdminUserToAccessItem(item: AdminUserItem): UserAccessItem {
  const clusterLabel =
    item.assignedClusters.length === 0 ? 'Global Scope' : item.assignedClusters.join(', ');
  const formattedLastActive = item.lastActiveAt
    ? new Date(item.lastActiveAt).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Belum ada aktivitas';

  return {
    id: item.id,
    nik: item.nik || undefined,
    name: item.fullName,
    email: item.vendorCompany ? `@${item.username} · ${item.vendorCompany}` : `@${item.username}`,
    username: item.username,
    role: item.role,
    cluster: clusterLabel,
    assignedClusters: item.assignedClusters,
    vendorCompany: item.vendorCompany || undefined,
    isActive: item.isActive,
    lastActive: formattedLastActive,
    telegramChatId: item.telegramChatId,
  };
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // 1. Master Jaringan & Pelanggan
  {
    code: 'customer:read',
    label: 'Lihat Master Data Pelanggan',
    description: 'Melihat database pelanggan, nomor SIA, dan alokasi fisik port splitter ODP.',
    category: 'Master Data & Jaringan',
  },
  {
    code: 'customer:update',
    label: 'Kelola Master Pelanggan & Mutasi Port',
    description: 'Memperbarui data pelanggan dan mengeksekusi mutasi nomor port splitter aktif.',
    category: 'Master Data & Jaringan',
  },
  {
    code: 'network:read',
    label: 'Lihat Master Jaringan & ODP',
    description: 'Melihat peta poligon cluster, sebaran ODP, dan okupasi port splitter.',
    category: 'Master Data & Jaringan',
  },
  {
    code: 'network:update',
    label: 'Kelola ODP & Splitter',
    description: 'Menambah atau memperbarui koordinat ODP dan batas kapasitas fisik port (8/16).',
    category: 'Master Data & Jaringan',
  },

  // 2. Work Order & Tiket
  {
    code: 'ticket:read',
    label: 'Lihat Tiket & Work Order',
    description: 'Membuka dan meninjau status penugasan tiket pasang baru (PSB) dan perbaikan.',
    category: 'Work Order & Tiketing',
  },
  {
    code: 'ticket:create',
    label: 'Buat & Tugaskan Tiket',
    description: 'Membuat tiket kerja baru dan memilih teknisi lapangan penanggung jawab.',
    category: 'Work Order & Tiketing',
  },

  // 3. Manajemen Teknisi & Sesi
  {
    code: 'tech:manage',
    label: 'Kendali Teknisi & Force Logout',
    description:
      'Mengubah status akun teknisi dan mencabut sesi mobile JWT/Redis seketika (PRD 2.2).',
    category: 'Manajemen Teknisi & Sesi',
  },

  // 4. Asisten AI On-Premise
  {
    code: 'ai:use',
    label: 'Akses On-Premise AI Chatbot',
    description: 'Menjalankan analitik data percakapan dan mengeksekusi Draft Action Cards.',
    category: 'Otomasi & AI Assistant',
  },

  // 5. Keamanan Sistem & RBAC
  {
    code: 'role:edit',
    label: 'Dynamic Role Editor (RBAC)',
    description: 'Mengubah konfigurasi matriks hak akses berjenjang (Anti-Privilege Escalation).',
    category: 'Keamanan Sistem & RBAC',
  },
];

export function useRoles() {
  const [activeView, setActiveView] = useState<'users' | 'matrix'>('users');
  const [roleList, setRoleList] = useState<RoleApiItem[]>(
    () => getCachedData<RoleApiItem[]>(ROLES_CACHE_KEY) ?? [],
  );
  const [userList, setUserList] = useState<UserAccessItem[]>(
    () => getCachedData<UserAccessItem[]>(USERS_CACHE_KEY) ?? [],
  );
  const [selectedRoleName, setSelectedRoleName] = useState('Admin Operasional');
  const [activePermissions, setActivePermissions] = useState<Set<string>>(new Set());

  // Filter states for users view
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('Semua Peran');
  const [clusterFilter, setClusterFilter] = useState('Semua Wilayah');

  // Role edit modal state
  const [editingUser, setEditingUser] = useState<UserAccessItem | null>(null);
  const [targetRoleId, setTargetRoleId] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const { canEditRole, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const { clusters: clusterOptions } = useClusterOptions();

  const fetchRoles = useCallback(
    async (force = false) => {
      try {
        if (!getCachedData<RoleApiItem[]>(ROLES_CACHE_KEY) || !getCachedData<UserAccessItem[]>(USERS_CACHE_KEY)) {
          setIsFetching(true);
        }

        const [rolesData, usersData] = await Promise.all([
          fetchWithCache<RoleApiItem[]>(
            ROLES_CACHE_KEY,
            async () => {
              const res = await fetch(ROLES_CACHE_KEY);
              const json = await res.json().catch(() => null);
              if (!res.ok || !json?.success || !Array.isArray(json.data)) {
                const parsed = notifyApiResponseError(
                  res.status,
                  json,
                  'Gagal memuat daftar peran RBAC',
                  { category: 'database', source: ROLES_CACHE_KEY },
                );
                throw new Error(parsed.message);
              }
              clearServiceUnavailable('database');
              return json.data as RoleApiItem[];
            },
            { force },
          ),
          fetchWithCache<UserAccessItem[]>(
            USERS_CACHE_KEY,
            async () => {
              const res = await fetch(USERS_CACHE_KEY);
              const json = await res.json().catch(() => null);
              if (!res.ok || !json?.success || !Array.isArray(json.data)) {
                const parsed = notifyApiResponseError(
                  res.status,
                  json,
                  'Gagal memuat daftar pengguna dari PostgreSQL',
                  { category: 'database', source: USERS_CACHE_KEY },
                );
                throw new Error(parsed.message);
              }
              clearServiceUnavailable('database');
              return (json.data as AdminUserItem[]).map(mapAdminUserToAccessItem);
            },
            { force },
          ),
        ]);

        setRoleList(rolesData);
        setUserList(usersData);
      } catch (err) {
        showError(err);
      } finally {
        setIsFetching(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const selectedRole = useMemo(() => {
    return roleList.find((r) => r.name === selectedRoleName) || roleList[0] || null;
  }, [roleList, selectedRoleName]);

  // Sync permissions when selected role changes
  useEffect(() => {
    if (!selectedRole) return;

    const perms = new Set<string>();
    const rolePerms = selectedRole.permissions || [];
    const hasWildcard = rolePerms.includes('*');

    if (hasWildcard) {
      PERMISSION_DEFINITIONS.forEach((p) => perms.add(p.code));
    } else {
      rolePerms.forEach((p) => perms.add(p));
    }

    setActivePermissions(perms);
  }, [selectedRole]);

  const isSuperAdminRole =
    selectedRole?.name === 'Super Admin' || selectedRole?.hierarchyLevel === 100;
  const isHierarchyProtected =
    user.hierarchyLevel !== 100 &&
    selectedRole &&
    selectedRole.hierarchyLevel >= user.hierarchyLevel;
  const isEditable = !isSuperAdminRole && canEditRole && !isHierarchyProtected;

  // Toggle permission
  const handleTogglePermission = (code: string) => {
    if (!isEditable) return;

    setActivePermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  // Save permissions
  const handleSavePermissions = async () => {
    if (!selectedRole || !isEditable) return;

    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/admin/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: selectedRole.id,
          permissions: Array.from(activePermissions),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal menyimpan perubahan hak akses',
          { category: 'database', source: ROLES_CACHE_KEY },
        );
        throw new Error(parsed.message);
      }

      setRoleList((prev) => {
        const next = prev.map((r) =>
          r.id === selectedRole.id ? { ...r, permissions: Array.from(activePermissions) } : r,
        );
        setCachedData(ROLES_CACHE_KEY, next);
        return next;
      });

      showSuccess(`Matriks izin untuk ${selectedRole.name} berhasil diperbarui.`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan hak akses';
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle user active status via PATCH /api/v1/admin/users/[id]
  const handleToggleUserStatus = async (targetUser: UserAccessItem) => {
    if (actionInProgress) return;
    setActionInProgress(targetUser.id);

    const updatedStatus = !targetUser.isActive;
    try {
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(targetUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: updatedStatus }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal memperbarui status akun pengguna',
          { category: 'database', source: USERS_CACHE_KEY },
        );
        throw new Error(parsed.message);
      }

      const mapped = mapAdminUserToAccessItem(json.data as AdminUserItem);
      setUserList((prev) => {
        const next = prev.map((u) => (u.id === targetUser.id ? mapped : u));
        setCachedData(USERS_CACHE_KEY, next);
        return next;
      });
      invalidateQueryCache('/api/v1/admin/technicians');
      showSuccess(
        `Akun ${targetUser.name} berhasil ${updatedStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Gagal memperbarui status akun');
    } finally {
      setActionInProgress(null);
    }
  };

  // Reassign user role via PATCH /api/v1/admin/users/[id]
  const handleReassignUserRole = async () => {
    if (!editingUser || !targetRoleId) return;

    const chosenRole = roleList.find((r) => r.id === targetRoleId || r.name === targetRoleId);
    if (!chosenRole) return;

    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(editingUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleName: chosenRole.name }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal mengubah peran pengguna',
          { category: 'database', source: USERS_CACHE_KEY },
        );
        throw new Error(parsed.message);
      }

      const mapped = mapAdminUserToAccessItem(json.data as AdminUserItem);
      setUserList((prev) => {
        const next = prev.map((u) => (u.id === editingUser.id ? mapped : u));
        setCachedData(USERS_CACHE_KEY, next);
        return next;
      });
      invalidateQueryCache(ROLES_CACHE_KEY, '/api/v1/admin/technicians');
      showSuccess(`Peran ${editingUser.name} berhasil diubah menjadi ${chosenRole.name}.`);
      setEditingUser(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengubah peran pengguna';
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Jump from User table to Role Matrix
  const handleInspectRolePermissions = (roleName: string) => {
    setSelectedRoleName(roleName);
    setActiveView('matrix');
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    const selectedClusterOpt = clusterOptions.find(
      (c) => c.clusterCode === clusterFilter || c.name === clusterFilter,
    );

    return userList.filter((u) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        (u.nik && u.nik.toLowerCase().includes(q)) ||
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.vendorCompany && u.vendorCompany.toLowerCase().includes(q)) ||
        u.cluster.toLowerCase().includes(q);

      const matchesRole = roleFilter === 'Semua Peran' || u.role === roleFilter;

      const matchesCluster =
        clusterFilter === 'Semua Wilayah' ||
        (clusterFilter === 'Global Scope' && u.assignedClusters.length === 0) ||
        u.assignedClusters.some(
          (assigned) =>
            assigned === clusterFilter ||
            (selectedClusterOpt &&
              (assigned === selectedClusterOpt.clusterCode ||
                assigned === selectedClusterOpt.name)),
        );

      return matchesSearch && matchesRole && matchesCluster;
    });
  }, [userList, searchQuery, roleFilter, clusterFilter, clusterOptions]);

  // Grouped permissions by category
  const categories = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    PERMISSION_DEFINITIONS.forEach((perm) => {
      const list = map.get(perm.category) || [];
      list.push(perm);
      map.set(perm.category, list);
    });
    return Array.from(map.entries());
  }, []);

  // Role Badge Styling Helper
  const getRoleBadgeStyle = (roleName: string) => {
    switch (roleName) {
      case 'Super Admin':
        return {
          background: 'var(--color-surface-accent)',
          color: 'var(--color-primary-text)',
          border: '1px solid var(--color-info-card-border)',
        };
      case 'Admin Operasional':
        return {
          background: 'var(--color-info-card-bg)',
          color: 'var(--color-info-card-title)',
          border: '1px solid var(--color-info-card-border)',
        };
      case 'NOC Monitoring':
        return {
          background: 'var(--color-surface-subtle)',
          color: 'var(--color-primary-text)',
          border: '1px solid var(--color-border-strong)',
        };
      case 'Customer Support':
        return {
          background: 'var(--color-success-bg)',
          color: 'var(--color-success-text)',
          border: '1px solid var(--color-success-border)',
        };
      case 'Teknisi Lapangan':
      default:
        return {
          background: 'var(--color-surface-subtle)',
          color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border-strong)',
        };
    }
  };

  // Computed operational KPI counts
  const activeUsersCount = useMemo(() => userList.filter((u) => u.isActive).length, [userList]);
  const telegramLinkedCount = useMemo(
    () => userList.filter((u) => Boolean(u.telegramChatId)).length,
    [userList],
  );
  const totalRolesCount = roleList.length;

  const handleAddUser = useCallback(
    async (newUserData: {
      name: string;
      nik: string;
      username: string;
      role: string;
      cluster: string;
      vendorCompany?: string;
      password?: string;
    }) => {
      const assignedClusters =
        newUserData.cluster && newUserData.cluster !== 'Global Scope'
          ? [newUserData.cluster]
          : [];

      const res = await fetch('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newUserData.name.trim(),
          nik: newUserData.nik.trim(),
          username: newUserData.username.trim().toLowerCase(),
          roleName: newUserData.role,
          vendorCompany: newUserData.vendorCompany?.trim() || undefined,
          password: newUserData.password?.trim() || undefined,
          assignedClusters,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        const parsed = notifyApiResponseError(
          res.status,
          json,
          'Gagal mendaftarkan pengguna baru ke PostgreSQL',
          { category: 'database', source: USERS_CACHE_KEY },
        );
        throw new Error(parsed.message);
      }

      const mapped = mapAdminUserToAccessItem(json.data as AdminUserItem);
      setUserList((prev) => {
        const next = [mapped, ...prev];
        setCachedData(USERS_CACHE_KEY, next);
        return next;
      });
      invalidateQueryCache(ROLES_CACHE_KEY, '/api/v1/admin/technicians');
      showSuccess(`Pengguna baru ${mapped.name} (NIK: ${mapped.nik || '-'}) berhasil disimpan ke PostgreSQL.`);
    },
    [showSuccess],
  );

  const handleUnlinkTelegram = useCallback(
    async (targetUser: UserAccessItem) => {
      try {
        const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(targetUser.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unlinkTelegram: true }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.data) {
          const parsed = notifyApiResponseError(
            res.status,
            json,
            'Gagal melepas ikatan Telegram 2FA',
            { category: 'database', source: USERS_CACHE_KEY },
          );
          throw new Error(parsed.message);
        }

        const mapped = mapAdminUserToAccessItem(json.data as AdminUserItem);
        setUserList((prev) => {
          const next = prev.map((u) => (u.id === targetUser.id ? mapped : u));
          setCachedData(USERS_CACHE_KEY, next);
          return next;
        });
        showSuccess(
          `Ikatan Telegram 2FA untuk ${targetUser.name} (NIK: ${targetUser.nik || '-'}) berhasil dilepas.`,
        );
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Gagal melepas ikatan Telegram');
      }
    },
    [showError, showSuccess],
  );

  return {
    activeView,
    setActiveView,
    roleList,
    userList,
    clusterOptions,
    activeUsersCount,
    telegramLinkedCount,
    totalRolesCount,
    selectedRoleName,
    setSelectedRoleName,
    selectedRole,
    activePermissions,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    clusterFilter,
    setClusterFilter,
    editingUser,
    setEditingUser,
    targetRoleId,
    setTargetRoleId,
    isLoading,
    isFetching,
    actionInProgress,
    user,
    fetchRoles,
    handleTogglePermission,
    handleSavePermissions,
    handleToggleUserStatus,
    handleReassignUserRole,
    handleInspectRolePermissions,
    handleAddUser,
    handleUnlinkTelegram,
    filteredUsers,
    categories,
    isSuperAdminRole,
    isHierarchyProtected,
    isEditable,
    getRoleBadgeStyle,
  };
}
