'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { RoleApiItem } from '../hooks/use-roles';

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userData: {
    name: string;
    nik: string;
    username: string;
    email: string;
    role: string;
    cluster: string;
  }) => void;
  roleList: RoleApiItem[];
}

const CLUSTERS = [
  'Global Scope',
  'Bandung Utara (BDG-01)',
  'Bandung Selatan (BDG-02)',
  'Bandung Timur (BDG-03)',
  'Bandung Barat (BDG-04)',
];

export function CreateUserModal({ isOpen, onClose, onSubmit, roleList }: CreateUserModalProps) {
  const [name, setName] = useState('');
  const [nik, setNik] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roleList[1]?.name || 'Admin Operasional');
  const [cluster, setCluster] = useState(CLUSTERS[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama lengkap wajib diisi');
      return;
    }
    if (!nik.trim()) {
      setError('Nomor Induk Karyawan (NIK) wajib diisi');
      return;
    }
    if (!username.trim()) {
      setError('Username wajib diisi');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Email perusahaan tidak valid');
      return;
    }

    setError(null);
    onSubmit({
      name: name.trim(),
      nik: nik.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      role,
      cluster,
    });
    onClose();
  };

  return (
    <dialog
      className="overlay"
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-title"
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
          maxWidth: '480px',
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
          <div>
            <h3
              id="create-user-title"
              style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'inherit' }}
            >
              Tambah Pengguna Baru
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Daftarkan operator atau teknisi baru ke sistem FiberOps NOC.
            </p>
          </div>
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

        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              htmlFor="add-user-name"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
            >
              Nama Lengkap Karyawan:
            </label>
            <input
              id="add-user-name"
              type="text"
              required
              placeholder="Contoh: Budi Hartono"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                htmlFor="add-user-nik"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
              >
                Nomor Induk Karyawan (NIK):
              </label>
              <input
                id="add-user-nik"
                type="text"
                required
                placeholder="Contoh: 882048"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="add-user-username"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
              >
                Username Login:
              </label>
              <input
                id="add-user-username"
                type="text"
                required
                placeholder="budi.ops"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="add-user-email"
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
            >
              Email Korporat:
            </label>
            <input
              id="add-user-email"
              type="email"
              required
              placeholder="budi.hartono@lintasarta.co.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                htmlFor="add-user-role"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
              >
                Peran Sistem (RBAC):
              </label>
              <select
                id="add-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              >
                {roleList.map((r) => (
                  <option key={r.id || r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-user-cluster"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}
              >
                Cakupan Wilayah:
              </label>
              <select
                id="add-user-cluster"
                value={cluster}
                onChange={(e) => setCluster(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              >
                {CLUSTERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="modal-info-note"
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'var(--color-surface, #f8fafc)',
              border: '1px solid var(--color-border)',
              fontSize: '11.5px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <Icon name="bot" size={15} style={{ marginTop: '1px', flexShrink: 0, color: 'var(--color-primary, #0e5b92)' }} />
            <span>
              Karyawan dapat langsung mengaktifkan 2FA OTP dengan mengirimkan NIK (<strong>{nik || '...'}</strong>) ke bot Telegram <strong>@FiberOpsNOCBot</strong>.
            </span>
          </div>

          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="role-action-btn secondary"
              style={{ padding: '8px 16px', borderRadius: '6px' }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="button primary"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                background: '#0e5b92',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Simpan Pengguna
            </button>
          </footer>
        </form>
      </article>
    </dialog>
  );
}

