'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { RoleApiItem } from '../hooks/use-roles';

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userData: {
    name: string;
    nik: string;
    username: string;
    role: string;
    cluster: string;
    vendorCompany?: string;
    password?: string;
  }) => Promise<void>;
  roleList: RoleApiItem[];
}

export function CreateUserModal({ isOpen, onClose, onSubmit, roleList }: CreateUserModalProps) {
  const { clusters } = useClusterOptions();
  const [name, setName] = useState('');
  const [nik, setNik] = useState('');
  const [username, setUsername] = useState('');
  const [vendorCompany, setVendorCompany] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(roleList[1]?.name || roleList[0]?.name || 'Admin Operasional');
  const [cluster, setCluster] = useState('Global Scope');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roleList.length > 0 && !roleList.some((r) => r.name === role)) {
      setRole(roleList[1]?.name || roleList[0].name);
    }
  }, [role, roleList]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama lengkap wajib diisi');
      return;
    }
    if (nik.trim().length < 3) {
      setError('Nomor Induk Karyawan (NIK) minimal 3 karakter');
      return;
    }
    if (!/^[a-z0-9._-]{3,50}$/.test(username.trim().toLowerCase())) {
      setError('Username minimal 3 karakter (huruf kecil, angka, titik, _ atau -)');
      return;
    }
    if (password.trim() && password.trim().length < 8) {
      setError('Kata sandi awal minimal 8 karakter (atau kosongkan untuk default sistem)');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        nik: nik.trim(),
        username: username.trim().toLowerCase(),
        role,
        cluster,
        vendorCompany: vendorCompany.trim() || undefined,
        password: password.trim() || undefined,
      });
      setName('');
      setNik('');
      setUsername('');
      setVendorCompany('');
      setPassword('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun pengguna baru.');
    } finally {
      setIsSubmitting(false);
    }
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

            <div className="modal-two-col-grid">
              <div>
                <label
                  htmlFor="add-user-vendor"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
                >
                  Perusahaan Vendor (Opsional):
                </label>
                <input
                  id="add-user-vendor"
                  type="text"
                  placeholder="Contoh: PT Mitra Fiber"
                  value={vendorCompany}
                  onChange={(e) => setVendorCompany(e.target.value)}
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

              <div>
                <label
                  htmlFor="add-user-password"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 600, margin: '0 0 4px' }}
                >
                  Kata Sandi Awal (Opsional):
                </label>
                <input
                  id="add-user-password"
                  type="password"
                  placeholder="Min. 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  <option value="Global Scope">Global Scope</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.clusterCode}>
                      {c.name} ({c.clusterCode})
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
              disabled={isSubmitting}
              className="button primary ui-btn-solid-primary"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Pengguna'}
            </button>
          </footer>
        </form>
      </article>
    </ModalOverlay>
  );
}

