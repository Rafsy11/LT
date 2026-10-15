'use client';

import React, { useState, useEffect } from 'react';

export default function NetworkPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [detail, setDetail] = useState<number | null>(null);
  const [networkData, setNetworkData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalClusters: 4,
    totalSplitters: 4,
    totalCapacity: 64,
    availableCapacity: 37,
  });

  useEffect(() => {
    fetch('/api/v1/admin/clusters')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setNetworkData(json.data.clusters);
          if (json.data.stats) setStats(json.data.stats);
        }
      })
      .catch(console.error);
  }, []);

  const filteredClusters = networkData.filter((c) => {
    const matchesCluster = cluster === 'Semua cluster' || c.name === cluster;
    const matchesSearch =
      search === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.clusterCode.toLowerCase().includes(search.toLowerCase()) ||
      c.splitterCode.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INFRASTRUKTUR & INVENTARIS AKSES</div>
          <h1>Master Jaringan</h1>
          <p>Single source of truth untuk cluster, splitter ODP, dan ketersediaan port fisik.</p>
        </div>
      </div>

      <section className="stats page-stats">
        <article className="stat">
          <div className="stat-top">Total Cluster</div>
          <div className="stat-value">{stats.totalClusters}</div>
          <span className="demo-note">Wilayah operasional aktif</span>
        </article>
        <article className="stat">
          <div className="stat-top">ODP / Splitter</div>
          <div className="stat-value">{stats.totalSplitters}</div>
          <span className="demo-note">Titik distribusi fisik</span>
        </article>
        <article className="stat">
          <div className="stat-top">Kapasitas Total Port</div>
          <div className="stat-value">{stats.totalCapacity}</div>
          <span className="demo-note">16 port per splitter ODP</span>
        </article>
        <article className="stat">
          <div className="stat-top">Port Tersedia</div>
          <div className="stat-value" style={{ color: '#25a47b' }}>{stats.availableCapacity}</div>
          <span className="demo-note">Siap aktivasi pasang baru (PSB)</span>
        </article>
      </section>

      <section className="panel">
        <div className="page-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Cari cluster atau ODP"
              placeholder="Cari kode cluster, ODP..."
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
          {filteredClusters.map((c, i) => {
            const usagePct = (c.usedPorts / c.maxPorts) * 100;
            const isExpanded = detail === i;
            return (
              <article className="network-card" key={c.clusterCode}>
                <div className="work-card-top">
                  <span className="network-symbol">▦</span>
                  <span className="badge green">Aktif</span>
                </div>
                <h3>{c.name}</h3>
                <p>
                  {c.clusterCode} · {c.splitterCode}
                </p>
                <div className="capacity">
                  <span>Penggunaan port</span>
                  <b>{c.usedPorts} / {c.maxPorts}</b>
                </div>
                <div className="capacity-bar">
                  <i style={{ width: `${usagePct}%` }} />
                </div>
                <button
                  className="text-button"
                  onClick={() => setDetail(isExpanded ? null : i)}
                >
                  {isExpanded ? 'Tutup detail' : 'Lihat detail port'} →
                </button>

                {isExpanded && (
                  <div style={{ marginTop: '16px' }}>
                    <div className="port-grid">
                      {c.ports.map((p: any) => (
                        <span
                          key={p.portNumber}
                          title={
                            p.isOccupied
                              ? `Port ${p.portNumber}: Terisi (${p.customerName || 'Aktif'})`
                              : `Port ${p.portNumber}: Tersedia`
                          }
                          className={p.isOccupied ? 'occupied' : ''}
                        >
                          {p.portNumber}
                        </span>
                      ))}
                    </div>
                    <p style={{ marginTop: '8px' }}>
                      <span style={{ color: '#9272bb' }}>■ Ungu: Terisi</span> &nbsp;·&nbsp;{' '}
                      <span style={{ color: '#61997a' }}>■ Hijau: Tersedia</span>
                    </p>
                    <p className="coordinate">
                      Koordinat Fisik: {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
