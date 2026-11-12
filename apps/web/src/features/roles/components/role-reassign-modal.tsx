'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { ModalOverlay } from '@/components/ui/modal-overlay';
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
    <ModalOverlay onClose={onClose} labelledBy="role-reassign-title">
      <article
        className="modal"
        style={{
          maxWidth: '440px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <h3
            id="role-reassign-title"
            style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'inherit' }}
          >
            Ubah Peran Pengguna
          </h3>
          <button
            type="button"
            className="dots"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section
            aria-label="Informasi Pengguna"
            className="modal-sub-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              borderRadius: '8px',
            }}
          >
            <DefaultAvatar size={36} name={editingUser.name} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'inherit' }}>
                {editingUser.name}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                {editingUser.nik ? <strong>NIK: {editingUser.nik} • </strong> : null}
                {editingUser.email}
              </div>
            </div>
          </section>

          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <label
              htmlFor="target-role-select"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'inherit',
                margin: '0 0 6px',
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
                marginTop: 0,
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
        </div>

        <footer className="modal-footer" style={{ justifyContent: 'flex-end', gap: '10px' }}>
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
    </ModalOverlay>
  );
}
