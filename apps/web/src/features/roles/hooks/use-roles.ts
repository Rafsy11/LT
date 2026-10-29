'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth, useToast } from '@/providers';

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
  name: string;
  email: string;
  username: string;
  role: string;
  cluster: string;
  isActive: boolean;
  lastActive: string;
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

export const INITIAL_FALLBACK_ROLES: RoleApiItem[] = [
  {
    id: 'role-super-admin',
    name: 'Super Admin',
    permissions: ['*'],
    hierarchyLevel: 100,
    _count: { users: 2 },
  },
  {
    id: 'role-admin-ops',
    name: 'Admin Operasional',
    permissions: [
      'customer:read',
      'customer:update',
      'network:read',
      'network:update',
      'ticket:read',
      'ticket:create',
      'tech:manage',
      'ai:use',
    ],
    hierarchyLevel: 50,
    _count: { users: 5 },
  },
  {
    id: 'role-noc-mon',
    name: 'NOC Monitoring',
    permissions: ['customer:read', 'network:read', 'ticket:read'],
    hierarchyLevel: 30,
    _count: { users: 4 },
  },
  {
    id: 'role-cs-support',
    name: 'Customer Support',
    permissions: ['customer:read', 'ticket:read', 'ticket:create'],
    hierarchyLevel: 20,
    _count: { users: 6 },
  },
  {
    id: 'role-tech-field',
    name: 'Teknisi Lapangan',
    permissions: ['ticket:read'],
    hierarchyLevel: 10,
    _count: { users: 12 },
  },
];

export const INITIAL_USERS: UserAccessItem[] = [
  {
    id: 'usr-1',
    name: 'Budi Santoso',
    email: 'budi.santoso@lintasarta.co.id',
    username: 'superadmin',
    role: 'Super Admin',
    cluster: 'Global Scope',
    isActive: true,
    lastActive: 'Baru saja',
  },
  {
    id: 'usr-2',
    name: 'Aditya Saputra',
    email: 'aditya.saputra@lintasarta.co.id',
    username: 'aditya.noc',
    role: 'Super Admin',
    cluster: 'Global Scope',
    isActive: true,
    lastActive: '10 menit yang lalu',
  },
  {
    id: 'usr-3',
    name: 'Siti Aminah',
    email: 'siti.aminah@lintasarta.co.id',
    username: 'siti.ops',
    role: 'Admin Operasional',
    cluster: 'Bandung Utara (BDG-01)',
    isActive: true,
    lastActive: '25 menit yang lalu',
  },
  {
    id: 'usr-4',
    name: 'Ahmad Dahlan',
    email: 'ahmad.dahlan@lintasarta.co.id',
    username: 'ahmad.ops',
    role: 'Admin Operasional',
    cluster: 'Bandung Selatan (BDG-02)',
    isActive: true,
    lastActive: '1 jam yang lalu',
  },
  {
    id: 'usr-5',
    name: 'Rizky Ramadhan',
    email: 'rizky.ramadhan@lintasarta.co.id',
    username: 'rizky.noc',
    role: 'NOC Monitoring',
    cluster: 'Bandung Utara (BDG-01)',
    isActive: true,
    lastActive: '3 jam yang lalu',
  },
  {
    id: 'usr-6',
    name: 'Maya Putri',
    email: 'maya.putri@lintasarta.co.id',
    username: 'maya.cs',
    role: 'Customer Support',
    cluster: 'Bandung Utara (BDG-01)',
    isActive: true,
    lastActive: '4 jam yang lalu',
  },
  {
    id: 'usr-7',
    name: 'Andi Pratama',
    email: 'andi.pratama@lintasarta.co.id',
    username: 'andi.tech',
    role: 'Teknisi Lapangan',
    cluster: 'Bandung Utara (BDG-01)',
    isActive: true,
    lastActive: '5 jam yang lalu',
  },
  {
    id: 'usr-8',
    name: 'Bambang Wijaya',
    email: 'bambang.wijaya@lintasarta.co.id',
    username: 'bambang.tech',
    role: 'Teknisi Lapangan',
    cluster: 'Bandung Selatan (BDG-02)',
    isActive: false,
    lastActive: '1 hari yang lalu',
  },
];

export function useRoles() {
  const [activeView, setActiveView] = useState<'users' | 'matrix'>('users');
  const [roleList, setRoleList] = useState<RoleApiItem[]>(INITIAL_FALLBACK_ROLES);
  const [userList, setUserList] = useState<UserAccessItem[]>(INITIAL_USERS);
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

  const fetchRoles = async () => {
    try {
      setIsFetching(true);
      const res = await fetch('/api/v1/admin/roles');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setRoleList(json.data);
      }
    } catch (err) {
      showError(err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

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
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id || 'superadmin',
          'x-username': user.username || 'superadmin',
          'x-user-role': user.roleName || 'Super Admin',
          'x-user-type': user.userType || 'SUPER_ADMIN',
          'x-hierarchy-level': String(user.hierarchyLevel || 100),
        },
        body: JSON.stringify({
          roleId: selectedRole.id,
          permissions: Array.from(activePermissions),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal menyimpan perubahan hak akses');
      }

      setRoleList((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id ? { ...r, permissions: Array.from(activePermissions) } : r,
        ),
      );

      showSuccess(`Matriks izin untuk ${selectedRole.name} berhasil diperbarui.`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan hak akses';
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle user active status
  const handleToggleUserStatus = (targetUser: UserAccessItem) => {
    if (actionInProgress) return;
    setActionInProgress(targetUser.id);

    const updatedStatus = !targetUser.isActive;
    setUserList((prev) =>
      prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: updatedStatus } : u)),
    );

    setTimeout(() => {
      setActionInProgress(null);
      showSuccess(
        `Akun ${targetUser.name} berhasil ${updatedStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
      );
    }, 300);
  };

  // Reassign user role
  const handleReassignUserRole = async () => {
    if (!editingUser || !targetRoleId) return;

    const chosenRole = roleList.find((r) => r.id === targetRoleId || r.name === targetRoleId);
    if (!chosenRole) return;

    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/admin/roles', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id || 'superadmin',
          'x-username': user.username || 'superadmin',
          'x-user-role': user.roleName || 'Super Admin',
          'x-user-type': user.userType || 'SUPER_ADMIN',
          'x-hierarchy-level': String(user.hierarchyLevel || 100),
        },
        body: JSON.stringify({
          targetUserId: editingUser.id,
          newRoleId: chosenRole.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Gagal mengubah peran pengguna');
      }

      setUserList((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, role: chosenRole.name } : u)),
      );

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
    return userList.filter((u) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'Semua Peran' || u.role === roleFilter;

      const matchesCluster =
        clusterFilter === 'Semua Wilayah' ||
        (clusterFilter === 'Global Scope' && u.cluster.includes('Global')) ||
        u.cluster.includes(clusterFilter);

      return matchesSearch && matchesRole && matchesCluster;
    });
  }, [userList, searchQuery, roleFilter, clusterFilter]);

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
          background: '#f0f7ff',
          color: '#0e5b92',
          border: '1px solid #c8e0f4',
        };
      case 'Admin Operasional':
        return {
          background: '#eff6ff',
          color: '#1d4ed8',
          border: '1px solid #bfdbfe',
        };
      case 'NOC Monitoring':
        return {
          background: '#f0fdfa',
          color: '#0f766e',
          border: '1px solid #99f6e4',
        };
      case 'Customer Support':
        return {
          background: '#f0fdf4',
          color: '#15803d',
          border: '1px solid #bbf7d0',
        };
      case 'Teknisi Lapangan':
      default:
        return {
          background: '#f8fafc',
          color: '#475569',
          border: '1px solid #e2e8f0',
        };
    }
  };

  return {
    activeView,
    setActiveView,
    roleList,
    userList,
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
    filteredUsers,
    categories,
    isSuperAdminRole,
    isHierarchyProtected,
    isEditable,
    getRoleBadgeStyle,
  };
}
