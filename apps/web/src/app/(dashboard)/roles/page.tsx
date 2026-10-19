'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';

interface RoleApiItem {
  id: string;
  name: string;
  permissions: string[];
  hierarchyLevel: number;
  _count?: { users: number };
}

interface PermissionDefinition {
  code: string;
  label: string;
  description: string;
  category: string;
}

interface UserAccessItem {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  cluster: string;
  isActive: boolean;
  lastActive: string;
}

const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
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
    description: 'Mengubah status akun teknisi dan mencabut sesi mobile JWT/Redis seketika (PRD 2.2).',
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

const INITIAL_FALLBACK_ROLES: RoleApiItem[] = [
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

const INITIAL_USERS: UserAccessItem[] = [
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

export default function RolesPage() {
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

  const isSuperAdminRole = selectedRole?.name === 'Super Admin' || selectedRole?.hierarchyLevel === 100;
  const isHierarchyProtected =
    user.hierarchyLevel !== 100 && selectedRole && selectedRole.hierarchyLevel >= user.hierarchyLevel;
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
        prev.map((r) => (r.id === selectedRole.id ? { ...r, permissions: Array.from(activePermissions) } : r))
      );

      showSuccess(`Matriks izin untuk ${selectedRole.name} berhasil diperbarui.`);
    } catch (err: any) {
      showError(err.message || 'Terjadi kesalahan saat menyimpan hak akses');
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
      prev.map((u) => (u.id === targetUser.id ? { ...u, isActive: updatedStatus } : u))
    );

    setTimeout(() => {
      setActionInProgress(null);
      showSuccess(
        `Akun ${targetUser.name} berhasil ${updatedStatus ? 'diaktifkan' : 'dinonaktifkan'}.`
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
        prev.map((u) => (u.id === editingUser.id ? { ...u, role: chosenRole.name } : u))
      );

      showSuccess(`Peran ${editingUser.name} berhasil diubah menjadi ${chosenRole.name}.`);
      setEditingUser(null);
    } catch (err: any) {
      showError(err.message || 'Gagal mengubah peran pengguna');
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

  return (
    <main className="roles-page" style={{ paddingBottom: '32px' }}>
      {/* Overview Header */}
      <div className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Role-Based Access Control</h1>
          <p className="overview-subtitle">
            Pengelolaan direktori pengguna, penugasan peran operasional, dan konfigurasi matriks izin sistem FTTH.
          </p>
        </div>

        <div className="overview-toolbar">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 500,
              color: '#334155',
              boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#16a34a',
                display: 'inline-block',
                boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)',
              }}
            />
            Otoritas Sistem Terpantau
          </div>

          <button
            className="button"
            onClick={fetchRoles}
            disabled={isFetching}
            title="Segarkan data akses"
            type="button"
            style={{
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '12px',
              boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metric Stat Cards */}
      <section className="roles-stats-grid" aria-label="Statistik RBAC" style={{ marginBottom: '24px' }}>
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Total Pengguna Sistem
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>
              {userList.length}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Operator dan akun terdaftar
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Otoritas Penuh
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0e5b92', fontWeight: 600 }}>
                Root Access
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0e5b92', margin: '8px 0 2px' }}>
              Super Admin
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Akses global konfigurasi sistem
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Admin Operasional
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#1d4ed8', margin: '8px 0 2px' }}>
              NOC &amp; Helpdesk
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Cakupan wilayah &amp; penugasan tiket
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Akses Lapangan
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#475569', margin: '8px 0 2px' }}>
              Teknisi Mobile
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Terikat tiket aktif &amp; validasi OPM
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* Main Container Card */}
      <section className="panel" style={{ padding: '20px 24px' }}>
        {/* Navigation Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          {/* Segmented View Switcher */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '8px',
              gap: '3px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView('users')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '7px 18px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeView === 'users' ? 600 : 500,
                background: activeView === 'users' ? '#ffffff' : 'transparent',
                color: activeView === 'users' ? '#0e5b92' : '#64748b',
                boxShadow: activeView === 'users' ? '0 1px 3px rgba(14, 91, 146, 0.08)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Direktori Pengguna &amp; Akses
            </button>

            <button
              type="button"
              onClick={() => setActiveView('matrix')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '7px 18px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeView === 'matrix' ? 600 : 500,
                background: activeView === 'matrix' ? '#ffffff' : 'transparent',
                color: activeView === 'matrix' ? '#0e5b92' : '#64748b',
                boxShadow: activeView === 'matrix' ? '0 1px 3px rgba(14, 91, 146, 0.08)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Konfigurasi Matriks Izin
            </button>
          </div>

          {/* Controls when in Users View */}
          {activeView === 'users' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#ffffff',
                  border: '1px solid #dce7f0',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  width: '260px',
                  color: '#64748b',
                }}
              >
                <Icon name="search" size={14} />
                <input
                  aria-label="Cari pengguna"
                  placeholder="Cari nama, email, username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    width: '100%',
                    fontSize: '12px',
                    color: '#0f172a',
                    padding: 0,
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Hapus pencarian"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>

              {/* Filter by Role */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter Peran"
                style={{
                  background: '#ffffff',
                  border: '1px solid #dce7f0',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#334155',
                  height: '32px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option>Semua Peran</option>
                <option>Super Admin</option>
                <option>Admin Operasional</option>
                <option>NOC Monitoring</option>
                <option>Customer Support</option>
                <option>Teknisi Lapangan</option>
              </select>

              {/* Filter by Wilayah */}
              <select
                value={clusterFilter}
                onChange={(e) => setClusterFilter(e.target.value)}
                aria-label="Filter Wilayah"
                style={{
                  background: '#ffffff',
                  border: '1px solid #dce7f0',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#334155',
                  height: '32px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option>Semua Wilayah</option>
                <option>Global Scope</option>
                <option>Bandung Utara</option>
                <option>Bandung Selatan</option>
              </select>
            </div>
          )}

          {/* Quick role selector pills when in Matrix View */}
          {activeView === 'matrix' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Pilih Peran:</span>
              {roleList.map((r) => {
                const isSelected = selectedRole?.name === r.name;
                return (
                  <button
                    key={r.id || r.name}
                    type="button"
                    onClick={() => setSelectedRoleName(r.name)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: isSelected ? 600 : 500,
                      background: isSelected ? '#0e5b92' : '#f8fafc',
                      color: isSelected ? '#ffffff' : '#334155',
                      border: `1px solid ${isSelected ? '#0e5b92' : '#dce7f0'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* VIEW 1: USER DIRECTORY & ACCESS MANAGEMENT (Modeled cleanly after Role UI.jpg) */}
        {activeView === 'users' && (
          <div>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '12.5px',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Pengguna</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Peran Sistem</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Cakupan Wilayah</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status Akses</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8' }}>
                        Tidak ada pengguna yang sesuai dengan filter pencarian ini.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const isCurrentUser = user.username === u.username;
                      const badgeStyle = getRoleBadgeStyle(u.role);

                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 0 ? '#ffffff' : '#fafcff',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* User Avatar + Name + Email */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <DefaultAvatar size={34} name={u.name} />
                              <div>
                                <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {u.name}
                                  {isCurrentUser && (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        fontWeight: 500,
                                      }}
                                    >
                                      Anda
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '1px' }}>
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Pill Badge */}
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                ...badgeStyle,
                              }}
                            >
                              {u.role}
                            </span>
                          </td>

                          {/* Cluster / Wilayah */}
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '11.5px',
                                color: '#334155',
                              }}
                            >
                              {u.cluster}
                            </span>
                          </td>

                          {/* Interactive Toggle Switch */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={u.isActive}
                                disabled={isCurrentUser || actionInProgress === u.id}
                                onClick={() => handleToggleUserStatus(u)}
                                style={{
                                  position: 'relative',
                                  width: '38px',
                                  height: '20px',
                                  borderRadius: '10px',
                                  background: u.isActive ? '#0e5b92' : '#cbd5e1',
                                  border: 'none',
                                  cursor: isCurrentUser ? 'not-allowed' : 'pointer',
                                  transition: 'background 0.2s ease',
                                  padding: 0,
                                  outline: 'none',
                                  opacity: isCurrentUser ? 0.7 : 1,
                                }}
                                title={isCurrentUser ? 'Tidak dapat menonaktifkan akun sendiri' : u.isActive ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                              >
                                <span
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    left: u.isActive ? '20px' : '2px',
                                    width: '16px',
                                    height: '16px',
                                    borderRadius: '50%',
                                    background: '#ffffff',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                    transition: 'left 0.2s ease',
                                  }}
                                />
                              </button>
                              <span style={{ fontSize: '11.5px', color: u.isActive ? '#15803d' : '#94a3b8', fontWeight: 500 }}>
                                {u.isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>
                          </td>

                          {/* Action Buttons */}
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => handleInspectRolePermissions(u.role)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  fontWeight: 500,
                                  background: '#ffffff',
                                  border: '1px solid #dce7f0',
                                  color: '#0e5b92',
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 2px rgba(14, 91, 146, 0.04)',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                Atur Izin
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser(u);
                                  const matchingRole = roleList.find((r) => r.name === u.role);
                                  setTargetRoleId(matchingRole?.id || '');
                                }}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  fontWeight: 500,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                Ubah Peran
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Quick Context Footer */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: '#64748b' }}>
              <span>Menampilkan {filteredUsers.length} dari {userList.length} operator</span>
              <span>Hak akses dieksekusi secara instan dengan verifikasi sesi token</span>
            </div>
          </div>
        )}

        {/* VIEW 2: ROLE PERMISSION MATRIX (Clean Table Matrix with Toggle Switches) */}
        {activeView === 'matrix' && (
          <div>
            {/* Role Header Info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '16px',
                marginBottom: '18px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>
                    {selectedRole?.name}
                  </h2>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: '#f0f7ff',
                      color: '#0e5b92',
                      border: '1px solid #c8e0f4',
                      fontWeight: 500,
                    }}
                  >
                    {isSuperAdminRole ? 'Global Otoritas Penuh' : 'Scoped Cluster (RLS)'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  {isSuperAdminRole
                    ? 'Peran Super Admin memiliki hak akses penuh tak terbatas ke seluruh modul sistem.'
                    : selectedRole?.name === 'Admin Operasional'
                    ? 'Mengelola master jaringan, data pelanggan, dan penugasan tiket di wilayah cluster terkait.'
                    : selectedRole?.name === 'NOC Monitoring'
                    ? 'Memantau telemetri OLT/ODP, status redaman pelanggan, dan visualisasi topologi jaringan.'
                    : selectedRole?.name === 'Customer Support'
                    ? 'Membuka tiket laporan gangguan pelanggan dan permohonan pasang baru (PSB).'
                    : 'Akses aplikasi mobile teknisi terikat nomor tiket aktif dan validasi OPM lapangan.'}
                </p>
              </div>

              {isSuperAdminRole && (
                <div
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '11.5px',
                    color: '#64748b',
                  }}
                >
                  Hak Akses Terkunci Penuh (Wildcard)
                </div>
              )}
            </div>

            {/* Matrix Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {categories.map(([categoryName, perms]) => (
                <div key={categoryName} style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  {/* Category Header */}
                  <div
                    style={{
                      padding: '10px 16px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: '#475569',
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {categoryName}
                  </div>

                  {/* Permissions rows */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {perms.map((perm, pIdx) => {
                      const isChecked = activePermissions.has(perm.code);
                      const isLocked = isSuperAdminRole || !isEditable;

                      return (
                        <div
                          key={perm.code}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderBottom: pIdx !== perms.length - 1 ? '1px solid #f1f5f9' : 'none',
                            background: isChecked ? '#ffffff' : '#fafafa',
                          }}
                        >
                          <div style={{ maxWidth: '80%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                {perm.label}
                              </span>
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontFamily: 'monospace',
                                  color: '#0e5b92',
                                  background: '#f0f7ff',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #d4e7f7',
                                }}
                              >
                                {perm.code}
                              </span>
                            </div>
                            <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                              {perm.description}
                            </p>
                          </div>

                          {/* Modern Sliding Toggle Switch */}
                          <div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isChecked}
                              disabled={isLocked}
                              onClick={() => handleTogglePermission(perm.code)}
                              style={{
                                position: 'relative',
                                width: '40px',
                                height: '22px',
                                borderRadius: '11px',
                                background: isChecked ? '#0e5b92' : '#cbd5e1',
                                border: 'none',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                transition: 'background 0.2s ease',
                                padding: 0,
                                outline: 'none',
                                opacity: isLocked ? 0.75 : 1,
                              }}
                              title={isLocked ? 'Izin dikunci oleh otoritas peran' : isChecked ? 'Nonaktifkan izin' : 'Aktifkan izin'}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  left: isChecked ? '20px' : '2px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: '#ffffff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                  transition: 'left 0.2s ease',
                                }}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Save Action Bar */}
            {isEditable && (
              <div
                style={{
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveView('users')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    background: '#ffffff',
                    border: '1px solid #dce7f0',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Kembali ke Direktori
                </button>

                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={isLoading}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    background: '#0e5b92',
                    border: 'none',
                    color: '#ffffff',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(14, 91, 146, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isLoading ? (
                    <>
                      <Icon name="refresh" size={14} className="spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={14} />
                      Simpan Matriks Izin
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Role Reassignment Modal */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 999,
            padding: '16px',
          }}
          onClick={() => setEditingUser(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                Ubah Peran Pengguna
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '16px' }}>
              <DefaultAvatar size={36} name={editingUser.name} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>{editingUser.name}</div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{editingUser.email}</div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Pilih Peran Baru:
              </label>
              <select
                value={targetRoleId}
                onChange={(e) => setTargetRoleId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  color: '#0f172a',
                  background: '#ffffff',
                  outline: 'none',
                }}
              >
                {roleList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: '#ffffff',
                  border: '1px solid #dce7f0',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReassignUserRole}
                disabled={isLoading}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#0e5b92',
                  border: 'none',
                  color: '#ffffff',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? 'Menyimpan...' : 'Perbarui Peran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
