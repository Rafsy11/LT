'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { UserAccessItem, RoleApiItem } from '../hooks/use-roles';

export interface RoleReassignModalProps {
  editingUser: UserAccessItem | null;
  roleList: RoleApiItem[];
  targetRoleId: string;
  setTargetRoleId: (id: string) => void;
  isLoading: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function RoleReassignModal({
  editingUser,
  roleList,
  targetRoleId,
  setTargetRoleId,
  isLoading,
  onClose,
  onSave,
}: RoleReassignModalProps) {
  if (!editingUser) return null;

  return (
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
      onClick={onClose}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
            Ubah Peran Pengguna
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <DefaultAvatar size={36} name={editingUser.name} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
              {editingUser.name}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b' }}>{editingUser.email}</div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '6px',
            }}
          >
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
            onClick={onClose}
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
            onClick={onSave}
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
  );
}
