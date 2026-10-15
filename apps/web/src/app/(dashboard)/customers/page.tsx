'use client';

import React, { useState, useEffect } from 'react';
import { classifyDbm, dbmTone } from '@isp/shared';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/admin/customers')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCustomers(json.data);
      })
      .catch(console.error);
  }, []);

  const scoped = customers.filter((c) => {
    const matchesCluster = cluster === 'Semua cluster' || c.cluster === cluster;
    const matchesSearch =
      search === '' ||
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase()) ||
      c.cluster.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  const activeCount = scoped.filter((c) => c.status === 'ACTIVE').length;
  const pendingCount = scoped.filter((c) => c.status === 'PENDING_INSTALL').length;
  const criticalCount = scoped.filter((c) => classifyDbm(c.currentAttenuation) === 'Critical').length;

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MASTER DATA PELANGGAN & SIA</div>
          <h1>Pelanggan (SIA)</h1>
          <p>Master data pelanggan FTTH, alokasi splitter port, dan riwayat redaman optik.</p>
        </div>
      </div>

      <section className="stats page-stats">
        <article className="stat">
          <div className="stat-top">Pelanggan Terdaftar</div>
          <div className="stat-value">{scoped.length}</div>
          <span className="demo-note">Total SIA aktif di wilayah</span>
        </article>
        <article className="stat">
          <div className="stat-top">Layanan Aktif</div>
          <div className="stat-value" style={{ color: '#25a47b' }}>{activeCount}</div>
          <span className="demo-note">Port splitter terkunci</span>
        </article>
        <article className="stat">
          <div className="stat-top">Menunggu Instalasi</div>
          <div className="stat-value">{pendingCount}</div>
          <span className="demo-note">Tiket PSB pending</span>
        </article>
        <article className="stat">
          <div className="stat-top">Perlu Perhatian</div>
          <div className="stat-value" style={{ color: '#db837d' }}>{criticalCount}</div>
          <span className="demo-note">Redaman &lt; -25 dBm</span>
        </article>
      </section>

      <section className="panel">
        <div className="page-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Cari pelanggan"
              placeholder="Cari nama pelanggan, nomor SIA, alamat..."
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

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pelanggan / SIA</th>
                <th>Alamat</th>
                <th>Cluster</th>
                <th>Splitter & Port</th>
                <th>Status Layanan</th>
                <th>Redaman Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {scoped.map((c) => {
                const tone = dbmTone(c.currentAttenuation);
                return (
                  <tr key={c.siaNumber}>
                    <td>
                      <b>{c.fullName}</b>
                      <small>SIA {c.siaNumber}</small>
                    </td>
                    <td>{c.address}</td>
                    <td>{c.cluster}</td>
                    <td>
                      <b>{c.splitterCode}</b>
                      <small>Port #{c.portNumber}</small>
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'ACTIVE' ? 'green' : 'blue'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <span className={`${tone}-text font-semibold`}>
                        {c.currentAttenuation} dBm
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!scoped.length && (
            <p className="empty">Data pelanggan tidak ditemukan.</p>
          )}
        </div>
      </section>
    </main>
  );
}
