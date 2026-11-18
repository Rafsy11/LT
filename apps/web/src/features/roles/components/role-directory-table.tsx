'use client';

import React from 'react';
import type { ClusterOptionItem } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/search-input';
import { RoleApiItem, UserAccessItem } from '../hooks/use-roles';

export interface RoleDirectoryTableProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  roleFilter: string;
  setRoleFilter: (r: string) => void;
  clusterFilter: string;
  setClusterFilter: (c: string) => void;
  roleList: RoleApiItem[];
  clusterOptions: ClusterOptionItem[];
  filteredUsers: UserAccessItem[];
  totalUsersCount: number;
  currentUsername?: string;
  actionInProgress: string | null;
  onToggleUserStatus: (u: UserAccessItem) => void;
  onInspectRolePermissions: (roleName: string) => void;
  onEditUserRole: (u: UserAccessItem) => void;
  onOpenTelegramGuide: (u: UserAccessItem) => void;
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
  roleList,
  clusterOptions,
  filteredUsers,
  totalUsersCount,
  currentUsername,
  actionInProgress,
  onToggleUserStatus,
  onEditUserRole,
  onOpenTelegramGuide,
}: RoleDirectoryTableProps) {
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    roleFilter !== 'Semua Peran' ||
    clusterFilter !== 'Semua Wilayah';

  const handleResetFilters = () => {
    setSearchQuery('');
    setRoleFilter('Semua Peran');
    setClusterFilter('Semua Wilayah');
  };

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
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Cari nama, NIK, username, atau vendor..."
          ariaLabel="Cari pengguna"
          className="table-search-box roles-search-box"
        />

        {/* Filter by Role */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter Peran"
          className="role-filter-select"
        >
          <option value="Semua Peran">Semua Peran</option>
          {roleList.map((r) => (
            <option key={r.id || r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>

        {/* Filter by Wilayah */}
        <select
          value={clusterFilter}
          onChange={(e) => setClusterFilter(e.target.value)}
          aria-label="Filter Wilayah"
          className="role-filter-select"
        >
          <option value="Semua Wilayah">Semua Wilayah</option>
          <option value="Global Scope">Global Scope</option>
          {clusterOptions.map((c) => (
            <option key={c.id} value={c.clusterCode}>
              {c.name} ({c.clusterCode})
            </option>
          ))}
        </select>
      </header>

      <div className="table-scroll desktop-role-table" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }} tabIndex={0} role="region" aria-label="Tabel Direktori Pengguna">
        <table
          className="lintasarta-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '12.5px',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <th scope="col" style={{ padding: '12px 10px', fontWeight: 600 }}>Pengguna</th>
              <th scope="col" style={{ padding: '12px 10px', fontWeight: 600 }}>Peran Sistem</th>
              <th scope="col" style={{ padding: '12px 10px', fontWeight: 600 }}>Cakupan Wilayah</th>
              <th scope="col" style={{ padding: '12px 10px', fontWeight: 600 }}>2FA Telegram</th>
              <th scope="col" style={{ padding: '12px 10px', fontWeight: 600 }}>Status Akses</th>
              <th scope="col" style={{ padding: '12px 12px 12px 8px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '16px' }}>
                  <EmptyState
                    icon="users"
                    title={
                      hasActiveFilters
                        ? 'Tidak ada pengguna yang sesuai filter'
                        : 'Belum ada pengguna terdaftar'
                    }
                    description={
                      hasActiveFilters
                        ? 'Tidak ditemukan akun dengan nama, peran, atau cakupan wilayah yang Anda pilih.'
                        : 'Belum ada operator atau staf terdaftar pada direktori akses.'
                    }
                    actionLabel={hasActiveFilters ? 'Reset Filter Direktori' : undefined}
                    actionIcon="refresh"
                    onAction={hasActiveFilters ? handleResetFilters : undefined}
                    size="compact"
                  />
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isCurrentUser = currentUsername === u.username;

                return (
                  <tr
                    key={u.id}
                    className="role-user-row"
                  >
                    {/* User Avatar + Name + NIK & Email */}
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <DefaultAvatar size={32} name={u.name} />
                        <div>
                          <div
                            className="role-user-name"
                            style={{
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12.5px',
                            }}
                          >
                            <span>{u.name}</span>
                            {u.nik && (
                              <span className="role-user-nik-badge">
                                NIK: {u.nik}
                              </span>
                            )}
                            {isCurrentUser && (
                              <span className="role-self-badge">
                                Anda
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--color-text-muted)',
                              marginTop: '2px',
                            }}
                          >
                            <span>{u.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* User Role (Clean Typography, Anti-Slop) */}
                    <td style={{ padding: '12px 10px' }}>
                      <span className="role-name-clean">
                        {u.role}
                      </span>
                    </td>

                    {/* Cluster / Wilayah */}
                    <td style={{ padding: '12px 10px' }}>
                      <span className="role-cluster-text">
                        {u.cluster}
                      </span>
                    </td>

                    {/* 2FA Telegram Integration Status */}
                    <td style={{ padding: '12px 10px' }}>
                      <button
                        type="button"
                        onClick={() => onOpenTelegramGuide(u)}
                        className={`telegram-status-badge ${u.telegramChatId ? 'connected' : 'pending'}`}
                        style={{ cursor: 'pointer', fontFamily: 'inherit' }}
                        title={
                          u.telegramChatId
                            ? `Chat ID Telegram: ${u.telegramChatId}. Klik untuk kelola 2FA.`
                            : 'Klik untuk panduan verifikasi NIK via @FiberOpsNOCBot'
                        }
                      >
                        <Icon name={u.telegramChatId ? 'check' : 'clock'} size={13} />
                        <span>
                          {u.telegramChatId
                            ? `Terhubung (••••${u.telegramChatId.slice(-4)})`
                            : 'Menunggu /start'}
                        </span>
                      </button>
                    </td>

                    {/* Interactive Toggle Switch */}
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={u.isActive}
                          disabled={isCurrentUser || actionInProgress === u.id}
                          onClick={() => onToggleUserStatus(u)}
                          className={`ui-switch-track ${u.isActive ? 'is-on' : ''}`}
                          style={{
                            position: 'relative',
                            width: '38px',
                            height: '20px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: isCurrentUser ? 'not-allowed' : 'pointer',
                            padding: 0,
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
                            className="ui-switch-thumb"
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: u.isActive ? '20px' : '2px',
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                            }}
                          />
                        </button>
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: u.isActive ? 'var(--color-success-text)' : 'var(--color-text-muted)',
                            fontWeight: 500,
                          }}
                        >
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </td>

                    {/* Action Buttons */}
                    <td style={{ padding: '12px 12px 12px 8px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '6px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onEditUserRole(u)}
                          className="role-action-btn secondary"
                          title="Ubah peran dan penugasan hak akses pengguna ini"
                        >
                          Ubah Peran
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenTelegramGuide(u)}
                          className="role-action-icon-btn"
                          title={
                            u.telegramChatId
                              ? 'Kelola atau lepas ikatan 2FA Telegram'
                              : 'Panduan verifikasi NIK ke bot Telegram'
                          }
                          aria-label={`Panduan Telegram 2FA ${u.name}`}
                        >
                          <Icon name="bot" size={14} />
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

      {/* Mobile Role Cards View (<768px) */}
      <div className="mobile-role-cards" aria-label="Daftar Kartu Pengguna">
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon="users"
            title={
              hasActiveFilters
                ? 'Tidak ada pengguna yang sesuai filter'
                : 'Belum ada pengguna terdaftar'
            }
            description={
              hasActiveFilters
                ? 'Tidak ditemukan akun dengan nama, peran, atau cakupan wilayah yang Anda pilih.'
                : 'Belum ada operator atau staf terdaftar pada direktori akses.'
            }
            actionLabel={hasActiveFilters ? 'Reset Filter Direktori' : undefined}
            actionIcon="refresh"
            onAction={hasActiveFilters ? handleResetFilters : undefined}
          />
        ) : (
          filteredUsers.map((u) => {
            const isCurrentUser = currentUsername === u.username;

            return (
              <article key={u.id} className="mobile-role-card">
                {/* Top Row: User Avatar, Name, and Status Switch */}
                <div className="mobile-role-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <DefaultAvatar size={34} name={u.name} />
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-role-name-row">
                        <h3 className="mobile-role-user-name">{u.name}</h3>
                        {isCurrentUser && <span className="role-self-badge">Anda</span>}
                      </div>
                      <div className="mobile-role-subtext">
                        <span>@{u.username}</span>
                        {u.nik && <span>· NIK {u.nik}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.isActive}
                      disabled={isCurrentUser || actionInProgress === u.id}
                      onClick={() => onToggleUserStatus(u)}
                      className={`ui-switch-track ${u.isActive ? 'is-on' : ''}`}
                      style={{
                        position: 'relative',
                        width: '38px',
                        height: '20px',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: isCurrentUser || actionInProgress === u.id ? 'not-allowed' : 'pointer',
                        padding: 0,
                        opacity: isCurrentUser ? 0.4 : 1,
                      }}
                      title={isCurrentUser ? 'Akun Anda' : u.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                    >
                      <span
                        className="ui-switch-thumb"
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: u.isActive ? '20px' : '2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                        }}
                      />
                    </button>
                    <span className={`role-status-text ${u.isActive ? 'active' : 'inactive'}`} style={{ fontSize: '11px' }}>
                      {u.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </div>

                {/* Role & Cluster Tag Strip */}
                <div className="mobile-role-spec-strip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="role-name-clean">{u.role}</span>
                    <span className="mobile-role-sep">·</span>
                    <span className="role-cluster-text">{u.cluster}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenTelegramGuide(u)}
                    className={`telegram-status-badge ${u.telegramChatId ? 'connected' : 'pending'}`}
                    style={{ cursor: 'pointer', fontSize: '10.5px', padding: '2px 6px' }}
                  >
                    <Icon name={u.telegramChatId ? 'check' : 'clock'} size={11} />
                    <span>{u.telegramChatId ? '2FA Aktif' : 'Belum 2FA'}</span>
                  </button>
                </div>

                {/* Card Action Buttons */}
                <div className="mobile-role-actions">
                  <button
                    type="button"
                    onClick={() => onEditUserRole(u)}
                    className="button mobile-role-edit-btn"
                  >
                    <Icon name="pencil" size={13} />
                    <span>Ubah Peran</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenTelegramGuide(u)}
                    className="button mobile-role-bot-btn"
                    title="Panduan Telegram"
                  >
                    <Icon name="bot" size={14} />
                    <span>Bot 2FA</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Quick Context Footer */}
      <footer
        style={{
          marginTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11.5px',
          color: 'var(--color-text-muted)',
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
