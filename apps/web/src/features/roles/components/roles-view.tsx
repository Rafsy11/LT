'use client';

import React from 'react';
import { useRoles } from '../hooks/use-roles';
import { RoleHeader } from './role-header';
import { RoleStats } from './role-stats';
import { RoleDirectoryTable } from './role-directory-table';
import { PermissionMatrixPanel } from './permission-matrix-panel';
import { RoleReassignModal } from './role-reassign-modal';

export function RolesView() {
  const {
    activeView,
    setActiveView,
    roleList,
    userList,
    selectedRole,
    setSelectedRoleName,
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
    isEditable,
    getRoleBadgeStyle,
  } = useRoles();

  return (
    <main className="roles-page" style={{ paddingBottom: '32px' }}>
      {/* Overview Header */}
      <RoleHeader isFetching={isFetching} onRefresh={fetchRoles} />

      {/* 4 Telemetry Metric Stat Cards */}
      <RoleStats totalUsers={userList.length} />

      {/* Main Container Card */}
      <section className="panel" style={{ padding: '20px 24px' }}>
        {/* Navigation Toolbar */}
        <header
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
          <nav
            role="tablist"
            aria-label="Navigasi Tampilan Peran"
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
              role="tab"
              aria-selected={activeView === 'users'}
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
              role="tab"
              aria-selected={activeView === 'matrix'}
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
          </nav>
        </header>

        {/* View 1: User Directory & Access Management */}
        {activeView === 'users' && (
          <RoleDirectoryTable
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            clusterFilter={clusterFilter}
            setClusterFilter={setClusterFilter}
            filteredUsers={filteredUsers}
            totalUsersCount={userList.length}
            currentUsername={user.username}
            actionInProgress={actionInProgress}
            onToggleUserStatus={handleToggleUserStatus}
            onInspectRolePermissions={handleInspectRolePermissions}
            onEditUserRole={(u) => {
              setEditingUser(u);
              const matchingRole = roleList.find((r) => r.name === u.role);
              setTargetRoleId(matchingRole?.id || '');
            }}
            getRoleBadgeStyle={getRoleBadgeStyle}
          />
        )}

        {/* View 2: Role Permission Matrix */}
        {activeView === 'matrix' && (
          <PermissionMatrixPanel
            roleList={roleList}
            selectedRole={selectedRole}
            onSelectRole={(name) => setSelectedRoleName(name)}
            categories={categories}
            activePermissions={activePermissions}
            isSuperAdminRole={isSuperAdminRole}
            isEditable={isEditable}
            isLoading={isLoading}
            onTogglePermission={handleTogglePermission}
            onSavePermissions={handleSavePermissions}
            onBackToDirectory={() => setActiveView('users')}
          />
        )}
      </section>

      {/* Role Reassignment Modal */}
      <RoleReassignModal
        editingUser={editingUser}
        roleList={roleList}
        targetRoleId={targetRoleId}
        setTargetRoleId={setTargetRoleId}
        isLoading={isLoading}
        onClose={() => setEditingUser(null)}
        onSave={handleReassignUserRole}
      />
    </main>
  );
}
