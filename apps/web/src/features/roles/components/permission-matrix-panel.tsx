'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { RoleApiItem, PermissionDefinition } from '../hooks/use-roles';

export interface PermissionMatrixPanelProps {
  roleList: RoleApiItem[];
  selectedRole: RoleApiItem | null;
  onSelectRole: (name: string) => void;
  categories: [string, PermissionDefinition[]][];
  activePermissions: Set<string>;
  isSuperAdminRole: boolean;
  isEditable: boolean;
  isLoading: boolean;
  onTogglePermission: (code: string) => void;
  onSavePermissions: () => void;
  onBackToDirectory: () => void;
}

export function PermissionMatrixPanel({
  roleList,
  selectedRole,
  onSelectRole,
  categories,
  activePermissions,
  isSuperAdminRole,
  isEditable,
  isLoading,
  onTogglePermission,
  onSavePermissions,
  onBackToDirectory,
}: PermissionMatrixPanelProps) {
  return (
    <section aria-label="Matriks Hak Akses">
      {/* Role Selector Pills */}
      <nav
        aria-label="Pilih Peran"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '18px',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Pilih Peran:</span>
        {roleList.map((r) => {
          const isSelected = selectedRole?.name === r.name;
          return (
            <button
              key={r.id || r.name}
              type="button"
              onClick={() => onSelectRole(r.name)}
              className={`matrix-role-pill ${isSelected ? 'active' : ''}`}
            >
              {r.name}
            </button>
          );
        })}
      </nav>

      {/* Role Header Info */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          marginBottom: '18px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--color-text)' }}>
              {selectedRole?.name}
            </h2>
            <span
              className="role-scope-badge"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              {isSuperAdminRole ? 'Global Otoritas Penuh' : 'Scoped Cluster (RLS)'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
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
          <div className="role-locked-badge">
            Hak Akses Terkunci Penuh (Wildcard)
          </div>
        )}
      </header>

      {/* Matrix Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {categories.map(([categoryName, perms]) => (
          <fieldset
            key={categoryName}
            className="role-perm-fieldset"
          >
            {/* Category Header */}
            <legend className="role-perm-legend">
              {categoryName}
            </legend>

            {/* Permissions rows */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {perms.map((perm, pIdx) => {
                const isChecked = activePermissions.has(perm.code);
                const isLocked = isSuperAdminRole || !isEditable;

                return (
                  <div
                    key={perm.code}
                    className={`matrix-permission-row ${isChecked ? 'active' : ''}`}
                    style={{
                      borderBottom: pIdx !== perms.length - 1 ? undefined : 'none',
                    }}
                  >
                    <div style={{ maxWidth: '80%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                          {perm.label}
                        </span>
                        <span
                          className="role-code-badge"
                          style={{
                            fontSize: '10.5px',
                            fontFamily: 'monospace',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {perm.code}
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
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
                        onClick={() => onTogglePermission(perm.code)}
                        className={`ui-switch-track ${isChecked ? 'is-on' : ''}`}
                        style={{
                          position: 'relative',
                          width: '40px',
                          height: '22px',
                          borderRadius: '11px',
                          border: 'none',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          padding: 0,
                          opacity: isLocked ? 0.75 : 1,
                        }}
                        title={
                          isLocked
                            ? 'Izin dikunci oleh otoritas peran'
                            : isChecked
                              ? 'Nonaktifkan izin'
                              : 'Aktifkan izin'
                        }
                      >
                        <span
                          className="ui-switch-thumb"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: isChecked ? '20px' : '2px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                          }}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {/* Bottom Save Action Bar */}
      {isEditable && (
        <footer
          className="ui-divider-top"
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            role="group"
            aria-label="Aksi simpan matriks izin"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={onBackToDirectory}
              className="button"
            >
              Kembali ke Direktori
            </button>

            <button
              type="button"
              onClick={onSavePermissions}
              disabled={isLoading}
              className="button primary"
              style={{
                padding: '8px 20px',
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
        </footer>
      )}
    </section>
  );
}
