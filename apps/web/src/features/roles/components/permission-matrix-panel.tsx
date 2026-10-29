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
    <div>
      {/* Role Selector Pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '18px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Pilih Peran:</span>
        {roleList.map((r) => {
          const isSelected = selectedRole?.name === r.name;
          return (
            <button
              key={r.id || r.name}
              type="button"
              onClick={() => onSelectRole(r.name)}
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
          <div
            key={categoryName}
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
          >
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
                        onClick={() => onTogglePermission(perm.code)}
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
                        title={
                          isLocked
                            ? 'Izin dikunci oleh otoritas peran'
                            : isChecked
                              ? 'Nonaktifkan izin'
                              : 'Aktifkan izin'
                        }
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
            onClick={onBackToDirectory}
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
            onClick={onSavePermissions}
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
  );
}
