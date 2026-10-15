'use client';

import React, { useState, useEffect } from 'react';

export default function TechniciansPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchTechs = () => {
    fetch('/api/v1/admin/technicians')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setTechnicians(json.data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchTechs();
  }, []);

  const handleToggle = async (username: string) => {
    try {
      const res = await fetch(`/api/v1/admin/technicians/${username}/toggle`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setFeedback(json.message);
        fetchTechs();
        setTimeout(() => setFeedback(null), 4000);
      } else {
        alert(json.error?.message);
      }
    } catch (e: any) {
      alert(`Gagal: ${e.message}`);
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
          <div className="eyebrow">MANAJEMEN PETUGAS LAPANGAN</div>
          <h1>Teknisi Lapangan</h1>
          <p>Pantau beban kerja tiket aktif dan kendali status akun teknisi (Force Logout / Instant Session Revocation).</p>
        </div>
      </div>

      {feedback && (
        <div className="info-strip" style={{ background: '#eaf7f1', borderColor: '#c8eedd', color: '#258d64' }}>
          ✓ {feedback}
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
          {scoped.map((tech) => (
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
              <button
                className={`button ${tech.isActive ? '' : 'primary'}`}
                onClick={() => handleToggle(tech.username)}
              >
                {tech.isActive ? 'Nonaktifkan Akun (Force Logout)' : 'Aktifkan Akun'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
