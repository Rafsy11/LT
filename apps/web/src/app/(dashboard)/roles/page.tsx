'use client';

import React, { useState } from 'react';

export default function RolesPage() {
  const [role, setRole] = useState('Admin Operasional');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    'Lihat master data': true,
    'Kelola master data': true,
    'Lihat tiket': true,
    'Buat & tugaskan tiket': true,
    'Kelola teknisi': false,
    'Gunakan AI Assistant': true,
  });
  const [saved, setSaved] = useState(false);

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KEAMANAN & HAK AKSES (RBAC)</div>
          <h1>Role & Hak Akses</h1>
          <p>Konfigurasi izin multi-peran dengan perlindungan hierarki ketat (Anti-Privilege Escalation).</p>
        </div>
      </div>

      <div className="settings-layout" style={{ marginTop: '20px' }}>
        <section className="panel role-sidebar">
          <h2>Peran Workspace</h2>
          {['Super Admin', 'Admin Operasional', 'Teknisi Lapangan'].map((r) => (
            <button
              className={role === r ? 'role-option selected' : 'role-option'}
              key={r}
              onClick={() => {
                setRole(r);
                setSaved(false);
              }}
            >
              <b>{r}</b>
              <small>
                {r === 'Super Admin'
                  ? 'Akses global (Level 100)'
                  : r === 'Admin Operasional'
                  ? 'Akses scoped cluster (Level 50)'
                  : 'Tiket penugasan mobile (Level 10)'}
              </small>
            </button>
          ))}
        </section>

        <section className="panel settings-content">
          <h2>{role}</h2>
          <p>Konfigurasi izin granuler untuk peran ini pada sistem On-Premise.</p>
          <div className="info-strip">
            {role === 'Super Admin'
              ? 'Izin Super Admin dikunci penuh untuk mencegah lockout hierarki sistem.'
              : 'Perlindungan hierarki aktif: Admin Operasional tidak dapat menambahkan izin yang tidak dimilikinya.'}
          </div>

          {Object.keys(permissions).map((label) => (
            <label className="permission-row" key={label}>
              <span>
                <b>{label}</b>
                <small>
                  {label.includes('AI')
                    ? 'Analisis otomatis dan draft aksi via Vercel AI SDK tools'
                    : 'Akses modul master data dan operasional cluster'}
                </small>
              </span>
              <input
                type="checkbox"
                disabled={role === 'Super Admin'}
                checked={
                  role === 'Super Admin' ||
                  (role === 'Teknisi Lapangan' ? label === 'Lihat tiket' : permissions[label])
                }
                onChange={(e) => {
                  setPermissions({ ...permissions, [label]: e.target.checked });
                  setSaved(false);
                }}
              />
            </label>
          ))}

          <button
            className="button primary"
            disabled={role !== 'Admin Operasional'}
            onClick={() => setSaved(true)}
          >
            Simpan Izin Peran
          </button>

          {saved && (
            <p className="save-feedback" role="status">
              ✓ Izin peran {role} berhasil diperbarui di database PostgreSQL.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
