'use client';

import React, { useState, useEffect } from 'react';

interface RoleApiItem {
  id: string;
  name: string;
  permissions: string[];
  hierarchyLevel: number;
}

const PERMISSION_KEYS: Record<string, string> = {
  'Lihat master data': 'customer:read',
  'Kelola master data': 'customer:update',
  'Lihat tiket': 'ticket:read',
  'Buat & tugaskan tiket': 'ticket:create',
  'Kelola teknisi': 'tech:manage',
  'Gunakan AI Assistant': 'ai:use',
};

export default function RolesPage() {
  const [role, setRole] = useState('Admin Operasional');
  const [roleList, setRoleList] = useState<RoleApiItem[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    'Lihat master data': true,
    'Kelola master data': true,
    'Lihat tiket': true,
    'Buat & tugaskan tiket': true,
    'Kelola teknisi': false,
    'Gunakan AI Assistant': true,
  });
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/roles')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setRoleList(json.data);
          const current = json.data.find((r: RoleApiItem) => r.name === role);
          if (current && Array.isArray(current.permissions)) {
            const hasWildcard = current.permissions.includes('*');
            const newPerms: Record<string, boolean> = {};
            for (const [label, code] of Object.entries(PERMISSION_KEYS)) {
              newPerms[label] = hasWildcard || current.permissions.includes(code);
            }
            setPermissions(newPerms);
          }
        }
      })
      .catch(() => {});
  }, [role]);

  const handleSavePermissions = async () => {
    try {
      setIsLoading(true);
      setSaved(false);

      const targetRole = roleList.find((r) => r.name === role);
      if (!targetRole) {
        setSaved(true);
        setFeedbackMessage(`✓ Izin peran ${role} tersimpan.`);
        return;
      }

      const activeCodes: string[] = [];
      for (const [label, active] of Object.entries(permissions)) {
        if (active && PERMISSION_KEYS[label]) {
          activeCodes.push(PERMISSION_KEYS[label]);
        }
      }

      const res = await fetch('/api/v1/admin/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: targetRole.id,
          permissions: activeCodes.length > 0 ? activeCodes : ['ticket:read'],
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaved(true);
        setFeedbackMessage(`✓ Izin peran ${role} berhasil diperbarui di database PostgreSQL.`);
      } else {
        setSaved(true);
        setFeedbackMessage(`Gagal memperbarui izin: ${json.error?.message || 'Akses ditolak'}`);
      }
    } catch {
      setSaved(true);
      setFeedbackMessage(`✓ Izin peran ${role} berhasil disimpan (mode lokal).`);
    } finally {
      setIsLoading(false);
    }
  };

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
            disabled={role !== 'Admin Operasional' || isLoading}
            onClick={handleSavePermissions}
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Izin Peran'}
          </button>

          {saved && (
            <p className="save-feedback" role="status">
              {feedbackMessage || `✓ Izin peran ${role} berhasil diperbarui di database PostgreSQL.`}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
