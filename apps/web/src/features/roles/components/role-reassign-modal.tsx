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
    <dialog
      className="overlay"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-reassign-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 999,
        padding: '16px',
        border: 'none',
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      }}
      onClick={onClose}
    >
      <article
        className="modal"
        style={{
          borderRadius: '10px',
          padding: '24px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3
            id="role-reassign-title"
            style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'inherit' }}
          >
            Ubah Peran Pengguna
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
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
        </header>

        <section
          aria-label="Informasi Pengguna"
          className="modal-sub-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <DefaultAvatar size={36} name={editingUser.name} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'inherit' }}>
              {editingUser.name}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
              {editingUser.nik ? <strong>NIK: {editingUser.nik} • </strong> : null}
              {editingUser.email}
            </div>
          </div>
        </section>

        <fieldset style={{ marginBottom: '20px', border: 0, margin: 0, padding: 0 }}>
          <label
            htmlFor="target-role-select"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'inherit',
              marginBottom: '6px',
            }}
          >
            Pilih Peran Baru:
          </label>
          <select
            id="target-role-select"
            value={targetRoleId}
            onChange={(e) => setTargetRoleId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12.5px',
              outline: 'none',
            }}
          >
            {roleList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </fieldset>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <div
            role="group"
            aria-label="Aksi perbarui peran"
            style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="button"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isLoading}
              className="button primary"
              style={{
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {isLoading ? 'Menyimpan...' : 'Perbarui Peran'}
            </button>
          </div>
        </footer>
      </article>
    </dialog>
  );
}
