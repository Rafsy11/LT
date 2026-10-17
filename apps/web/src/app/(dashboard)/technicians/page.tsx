'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';

export default function TechniciansPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [togglingTech, setTogglingTech] = useState<string | null>(null);
  const toggleRef = useRef<boolean>(false);

  const { canManageTech } = useAuth();
  const { showSuccess, showError } = useToast();

  const fetchTechs = () => {
    fetch('/api/v1/admin/technicians')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setTechnicians(json.data);
      })
      .catch((err) => showError(err));
  };

  useEffect(() => {
    fetchTechs();
  }, []);

  /**
   * Force Logout & Instant Session Revocation (PRD Section 2.2).
   * Dilindungi Permission Matrix (tech:manage) & Debounce 1-milidetik.
   */
  const handleToggle = async (username: string) => {
    // 1. Permission Matrix Guard (Requirement 3)
    if (!canManageTech) {
      showError({
        code: 'FORBIDDEN',
        message: 'Akses Ditolak: Anda tidak memiliki izin tech:manage untuk melakukan Force Logout teknisi.',
      });
      return;
    }

    // 2. Debounce guard 1-milidetik (Requirement 2)
    if (toggleRef.current) return;
    toggleRef.current = true;
    setTogglingTech(username);

    try {
      const res = await fetch(`/api/v1/admin/technicians/${username}/toggle`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        showSuccess(json.message || `Status akun teknisi ${username} berhasil diperbarui.`);
        fetchTechs();
      } else {
        // 3. Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
        showError(json.error);
      }
    } catch (e: unknown) {
      // 3. Sanitasi Pesan Error di UI (Anti-Information Leakage - Requirement 1)
      showError(e);
    } finally {
      toggleRef.current = false;
      setTogglingTech(null);
    }
  };

  const scoped = technicians.filter((t) => {
    const matchesCluster = cluster === 'Semua cluster' || t.cluster === cluster;
    const matchesSearch =
      search === '' ||
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.username.toLowerCase().includes(search.toLowerCase()) ||
      t.cluster.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  const activeCount = scoped.filter((t) => t.isActive).length;
  const busyCount = scoped.filter((t) => t.activeTicketsCount > 0).length;
  const disabledCount = scoped.filter((t) => !t.isActive).length;

  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>Teknisi Lapangan</h1>
          <p>Pantau beban kerja tiket aktif dan kendali status sesi perangkat (Force Logout & Token Revocation).</p>
        </div>
      </div>

      {!canManageTech && (
        <div
          className="info-strip"
          style={{
            background: '#fffbeb',
            borderColor: '#fde68a',
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🔒</span>
          <span>
            <b>Mode Peninjauan (Read-Only):</b> Akun Anda tidak memiliki izin <code>tech:manage</code>. Tombol Force Logout dinonaktifkan secara kondisional.
          </span>
        </div>
      )}

      <section className="stats page-stats">
        <article className="stat">
          <div className="stat-top">Teknisi Terdaftar</div>
          <div className="stat-value">{scoped.length}</div>
          <span className="demo-note">Pengguna aplikasi mobile</span>
        </article>
        <article className="stat">
          <div className="stat-top">Akun Aktif</div>
          <div className="stat-value" style={{ color: '#25a47b' }}>{activeCount}</div>
          <span className="demo-note">Memiliki sesi JWT sah</span>
        </article>
        <article className="stat">
          <div className="stat-top">Sedang Bertugas</div>
          <div className="stat-value" style={{ color: '#5687ce' }}>{busyCount}</div>
          <span className="demo-note">Memegang tiket terbuka</span>
        </article>
        <article className="stat">
          <div className="stat-top">Akun Dinonaktifkan</div>
          <div className="stat-value" style={{ color: disabledCount > 0 ? '#db837d' : undefined }}>
            {disabledCount}
          </div>
          <span className="demo-note">Akses mobile terblokir</span>
        </article>
      </section>

      <section className="panel">
        <div className="page-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Cari teknisi"
              placeholder="Cari nama teknisi atau wilayah..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-left">
            <select value={cluster} onChange={(e) => setCluster(e.target.value)}>
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
              <option>Bandung Selatan</option>
            </select>
          </div>
        </div>

        <div className="network-grid">
          {scoped.map((tech) => {
            const isToggling = togglingTech === tech.username;

            return (
              <article className="network-card" key={tech.username}>
                <div className="work-card-top">
                  <span className="tech-avatar">{tech.initials}</span>
                  <span className={`badge ${tech.isActive ? 'green' : 'neutral'}`}>
                    {tech.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <h3>{tech.fullName}</h3>
                <p>Teknisi Lapangan · {tech.cluster}</p>
                <div className="tech-metrics">
                  <div>
                    <b>{tech.activeTicketsCount}</b>
                    <small>Tiket aktif</small>
                  </div>
                  <div>
                    <b>{tech.completedTicketsCount}</b>
                    <small>Tiket selesai</small>
                  </div>
                </div>

                {/* Conditional Rendering Berdasarkan Permission Matrix (Requirement 3) */}
                {canManageTech ? (
                  <button
                    className={`button ${tech.isActive ? '' : 'primary'}`}
                    disabled={isToggling}
                    onClick={() => handleToggle(tech.username)}
                  >
                    {isToggling
                      ? 'Memproses Sesi...'
                      : tech.isActive
                        ? 'Nonaktifkan Akun (Force Logout)'
                        : 'Aktifkan Akun'}
                  </button>
                ) : (
                  <button
                    className="button disabled"
                    disabled
                    title="Izin tech:manage diperlukan untuk Force Logout"
                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                  >
                    🔒 Force Logout (Perlu Izin)
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
