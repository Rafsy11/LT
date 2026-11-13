'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
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
    <ModalOverlay onClose={onClose} labelledBy="create-user-title">
      <article
        className="modal"
        style={{
          width: '100%',
          maxWidth: '500px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
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
            className="dots"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div
                className="ui-alert-banner ui-alert-banner--error"
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="add-user-name"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
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
                  marginTop: 0,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div className="modal-two-col-grid">
              <div>
                <label
                  htmlFor="add-user-nik"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
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
                    marginTop: 0,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '12.5px',
                    boxSizing: 'border-box',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="add-user-username"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
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
                    marginTop: 0,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '12.5px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="add-user-email"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
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
                  marginTop: 0,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div className="modal-two-col-grid">
              <div>
                <label
                  htmlFor="add-user-role"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
                >
                  Peran Sistem (RBAC):
                </label>
                <select
                  id="add-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 0,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
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
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
                >
                  Cakupan Wilayah:
                </label>
                <select
                  id="add-user-cluster"
                  value={cluster}
                  onChange={(e) => setCluster(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 0,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
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
              className="modal-info-note ui-surface-subtle"
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                fontSize: '11.5px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <Icon
                name="bot"
                size={15}
                className="ui-text-primary"
                style={{ marginTop: '1px', flexShrink: 0 }}
              />
              <span>
                Karyawan dapat langsung mengaktifkan 2FA OTP dengan mengirimkan NIK (<strong>{nik || '...'}</strong>) ke bot Telegram <strong>@FiberOpsNOCBot</strong>.
              </span>
            </div>
          </div>

          <footer className="modal-footer" style={{ justifyContent: 'flex-end', gap: '10px' }}>
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
              className="button primary ui-btn-solid-primary"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Simpan Pengguna
            </button>
          </footer>
        </form>
      </article>
    </ModalOverlay>
  );
}

