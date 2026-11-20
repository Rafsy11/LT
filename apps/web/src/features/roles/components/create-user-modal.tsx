'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { FieldError } from '@/components/ui/FieldError';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useClusterOptions } from '@/hooks/use-cluster-options';
import { isAppError, normalizeAppError } from '@/lib/error-normalizer';
import { RoleApiItem } from '../hooks/use-roles';

type CreateUserFieldKey = 'name' | 'nik' | 'username' | 'password';

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
  const [errorRefCode, setErrorRefCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateUserFieldKey, string>>>({});

  const clearField = (key: CreateUserFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (roleList.length > 0 && !roleList.some((r) => r.name === role)) {
      setRole(roleList[1]?.name || roleList[0].name);
    }
  }, [role, roleList]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextFieldErrors: Partial<Record<CreateUserFieldKey, string>> = {};

    if (!name.trim()) {
      nextFieldErrors.name = 'Nama lengkap karyawan perlu diisi.';
    }
    if (nik.trim().length < 3) {
      nextFieldErrors.nik = 'Nomor Induk Karyawan (NIK) minimal 3 karakter.';
    }
    if (!/^[a-z0-9._-]{3,50}$/.test(username.trim().toLowerCase())) {
      nextFieldErrors.username = 'Username minimal 3 karakter (huruf kecil, angka, titik, _ atau -).';
    }
    if (password.trim() && password.trim().length < 8) {
      nextFieldErrors.password = 'Kata sandi awal minimal 8 karakter atau biarkan kosong untuk default.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      setErrorRefCode(null);
      return;
    }

    setFieldErrors({});
    setError(null);
    setErrorRefCode(null);
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
      const normalized = normalizeAppError(err, {
        fallbackMessage: 'Akun pengguna baru belum dapat disimpan saat ini. Silakan coba kembali.',
      });
      if (isAppError(err) && err.fieldErrors) {
        const mapped: Partial<Record<CreateUserFieldKey, string>> = {};
        if (err.fieldErrors.name || err.fieldErrors.fullName) {
          mapped.name = err.fieldErrors.name || err.fieldErrors.fullName;
        }
        if (err.fieldErrors.nik) mapped.nik = err.fieldErrors.nik;
        if (err.fieldErrors.username) mapped.username = err.fieldErrors.username;
        if (err.fieldErrors.password) mapped.password = err.fieldErrors.password;
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
        }
      }
      setError(normalized.message);
      setErrorRefCode(
        normalized.category === 'SERVER_ERROR' || normalized.statusCode >= 500
          ? normalized.refCode
          : null,
      );
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

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div
                role="alert"
                className="ui-alert-banner ui-alert-banner--error"
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                }}
              >
                <div>{error}</div>
                {errorRefCode && (
                  <span className="connection-banner-ref">Ref: {errorRefCode}</span>
                )}
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
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'add-user-name-err' : undefined}
                className={fieldErrors.name ? 'ui-input-invalid' : ''}
                placeholder="Contoh: Budi Hartono"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField('name');
                }}
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
              <FieldError id="add-user-name-err" message={fieldErrors.name} />
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
                  aria-invalid={Boolean(fieldErrors.nik)}
                  aria-describedby={fieldErrors.nik ? 'add-user-nik-err' : undefined}
                  className={fieldErrors.nik ? 'ui-input-invalid' : ''}
                  placeholder="Contoh: 882048"
                  value={nik}
                  onChange={(e) => {
                    setNik(e.target.value);
                    clearField('nik');
                  }}
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
                <FieldError id="add-user-nik-err" message={fieldErrors.nik} />
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
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'add-user-username-err' : undefined}
                  className={fieldErrors.username ? 'ui-input-invalid' : ''}
                  placeholder="budi.ops"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearField('username');
                  }}
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
                <FieldError id="add-user-username-err" message={fieldErrors.username} />
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
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'add-user-pass-err' : undefined}
                  className={fieldErrors.password ? 'ui-input-invalid' : ''}
                  placeholder="Min. 8 karakter"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearField('password');
                  }}
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
                <FieldError id="add-user-pass-err" message={fieldErrors.password} />
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

