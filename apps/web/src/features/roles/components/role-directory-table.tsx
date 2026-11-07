'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { UserAccessItem } from '../hooks/use-roles';

export interface RoleDirectoryTableProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  roleFilter: string;
  setRoleFilter: (r: string) => void;
  clusterFilter: string;
  setClusterFilter: (c: string) => void;
  filteredUsers: UserAccessItem[];
  totalUsersCount: number;
  currentUsername?: string;
  actionInProgress: string | null;
  onToggleUserStatus: (u: UserAccessItem) => void;
  onInspectRolePermissions: (roleName: string) => void;
  onEditUserRole: (u: UserAccessItem) => void;
  getRoleBadgeStyle: (roleName: string) => React.CSSProperties;
}

function getRoleBadgeSlug(roleName: string): string {
  switch (roleName) {
    case 'Super Admin':
      return 'super-admin';
    case 'Admin Operasional':
      return 'admin-ops';
    case 'NOC Monitoring':
      return 'noc';
    case 'Customer Support':
      return 'support';
    case 'Teknisi Lapangan':
    default:
      return 'field-tech';
  }
}

export function RoleDirectoryTable({
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  clusterFilter,
  setClusterFilter,
  filteredUsers,
  totalUsersCount,
  currentUsername,
  actionInProgress,
  onToggleUserStatus,
  onInspectRolePermissions,
  onEditUserRole,
  getRoleBadgeStyle,
}: RoleDirectoryTableProps) {
  return (
    <section aria-label="Direktori Pengguna & Hak Akses">
      {/* Search & Filter Toolbar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        {/* Search input */}
        <search
          role="search"
          aria-label="Cari pengguna"
          className="table-search-box"
          style={{ width: '260px' }}
        >
          <Icon name="search" size={14} />
          <input
            aria-label="Cari pengguna"
            placeholder="Cari nama, email, username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Hapus pencarian"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: '#94a3b8',
              }}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </search>

        {/* Filter by Role */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter Peran"
          className="role-filter-select"
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
          className="role-filter-select"
        >
          <option>Semua Wilayah</option>
          <option>Global Scope</option>
          <option>Bandung Utara</option>
          <option>Bandung Selatan</option>
        </select>
      </header>

      <div className="table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }} tabIndex={0} role="region" aria-label="Tabel Direktori Pengguna">
        <table
          className="lintasarta-table"
          style={{
            width: '100%',
            minWidth: '680px',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '12.5px',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid #e2e8f0',
                color: '#64748b',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <th scope="col" style={{ padding: '12px 16px', fontWeight: 600 }}>Pengguna</th>
              <th scope="col" style={{ padding: '12px 16px', fontWeight: 600 }}>Peran Sistem</th>
              <th scope="col" style={{ padding: '12px 16px', fontWeight: 600 }}>Cakupan Wilayah</th>
              <th scope="col" style={{ padding: '12px 16px', fontWeight: 600 }}>Status Akses</th>
              <th scope="col" style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8' }}
                >
                  Tidak ada pengguna yang sesuai dengan filter pencarian ini.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isCurrentUser = currentUsername === u.username;
                const badgeStyle = getRoleBadgeStyle(u.role);

                return (
                  <tr
                    key={u.id}
                    className="role-user-row"
                  >
                    {/* User Avatar + Name + Email */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <DefaultAvatar size={34} name={u.name} />
                        <div>
                          <div
                            className="role-user-name"
                            style={{
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            {u.name}
                            {isCurrentUser && (
                              <span className="role-self-badge">
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

                    {/* User Role (Clean Typography, Anti-Slop) */}
                    <td style={{ padding: '14px 16px' }}>
                      <span className="role-name-clean">
                        {u.role}
                      </span>
                    </td>

                    {/* Cluster / Wilayah */}
                    <td style={{ padding: '14px 16px' }}>
                      <span className="role-cluster-text">
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
                          onClick={() => onToggleUserStatus(u)}
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
                          title={
                            isCurrentUser
                              ? 'Tidak dapat menonaktifkan akun sendiri'
                              : u.isActive
                                ? 'Klik untuk nonaktifkan'
                                : 'Klik untuk aktifkan'
                          }
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
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: u.isActive ? '#15803d' : '#94a3b8',
                            fontWeight: 500,
                          }}
                        >
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </td>

                    {/* Action Buttons */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => onInspectRolePermissions(u.role)}
                          className="role-action-btn"
                        >
                          Atur Izin
                        </button>

                        <button
                          type="button"
                          onClick={() => onEditUserRole(u)}
                          className="role-action-btn secondary"
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
      <footer
        style={{
          marginTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11.5px',
          color: '#64748b',
        }}
      >
        <span>
          Menampilkan {filteredUsers.length} dari {totalUsersCount} operator
        </span>
        <span>Hak akses dieksekusi secara instan dengan verifikasi sesi token</span>
      </footer>
    </section>
  );
}
