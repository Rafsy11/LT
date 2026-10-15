'use client';

import React, { useState, useEffect } from 'react';
import { classifyDbm, dbmTone } from '@repo/shared';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';

export default function MonitoringPage() {
  const [tab, setTab] = useState('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [reports, setReports] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  useEffect(() => {
    // Initial fetch of recent reports from tickets
    fetch('/api/v1/admin/tickets')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setReports(json.data);
        }
      })
      .catch(console.error);

    // Connect to live SSE endpoint
    const eventSource = new EventSource('/api/v1/admin/stream/reports');

    eventSource.addEventListener('report', (e) => {
      try {
        const item = JSON.parse(e.data);
        setReports((prev) => [
          {
            ticketNumber: item.ticketNumber,
            customerName: item.customerName,
            siaNumber: item.siaNumber,
            ticketType: item.type,
            cluster: item.clusterName,
            assignedTech: item.technicianName,
            techInitials: item.techInitials,
            status: 'Selesai',
            currentAttenuation: item.attenuationDbm,
          },
          ...prev,
        ]);
      } catch (err) {
        console.error('SSE Error:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const scoped = reports.filter((r) => {
    const matchesCluster = cluster === 'Semua cluster' || r.cluster === cluster;
    const matchesSearch =
      search === '' ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.cluster.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  const filtered = scoped.filter(
    (r) => tab === 'Semua' || classifyDbm(r.currentAttenuation) === tab
  );

  const normalCount = scoped.filter((r) => classifyDbm(r.currentAttenuation) === 'Normal').length;
  const warningCount = scoped.filter((r) => classifyDbm(r.currentAttenuation) === 'Warning').length;
  const criticalCount = scoped.filter((r) => classifyDbm(r.currentAttenuation) === 'Critical').length;

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITORING REDAMAN REAL-TIME</div>
          <h1>Live Monitoring</h1>
          <p>Aliran sinyal redaman optik masuk dari teknisi lapangan melalui Server-Sent Events (SSE).</p>
        </div>
      </div>

      <section className="stats page-stats">
        <article className="stat">
          <div className="stat-top">Laporan Masuk</div>
          <div className="stat-value">{scoped.length}</div>
          <span className="demo-note">Live SSE feed aktif</span>
        </article>
        <article className="stat">
          <div className="stat-top">Normal (-15 s/d -22 dBm)</div>
          <div className="stat-value" style={{ color: '#25a47b' }}>{normalCount}</div>
          <span className="demo-note">Kualitas optik optimal</span>
        </article>
        <article className="stat">
          <div className="stat-top">Warning (-22.1 s/d -25 dBm)</div>
          <div className="stat-value" style={{ color: '#d6a25b' }}>{warningCount}</div>
          <span className="demo-note">Perlu pemantauan lanjutan</span>
        </article>
        <article className="stat">
          <div className="stat-top">Critical (&lt; -25 dBm)</div>
          <div className="stat-value" style={{ color: '#db837d' }}>{criticalCount}</div>
          <span className="demo-note">Peringatan otomatis aktif</span>
        </article>
      </section>

      <section className="panel">
        <div className="page-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Cari data"
              placeholder="Cari pelanggan, nomor SIA, tiket..."
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

        <div className="page-tabs">
          {['Semua', 'Normal', 'Warning', 'Critical'].map((item) => (
            <button
              key={item}
              className={tab === item ? 'selected' : ''}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="monitor-list">
          {filtered
            .sort((a, b) => Number(a.currentAttenuation) - Number(b.currentAttenuation))
            .map((r, i) => {
              const status = classifyDbm(r.currentAttenuation);
              const tone = dbmTone(r.currentAttenuation);
              return (
                <div className="monitor-row" key={`${r.ticketNumber}-${i}`}>
                  <div
                    className={`signal-icon ${
                      status === 'Normal' ? 'success' : status === 'Warning' ? 'warning' : 'critical'
                    }`}
                  >
                    ≈
                  </div>
                  <div>
                    <b>{r.customerName}</b>
                    <p>
                      SIA {r.siaNumber} · {r.cluster}
                    </p>
                    <small>
                      {r.assignedTech} · {r.ticketNumber} · Tiket {r.ticketType}
                    </small>
                  </div>
                  <div className="signal-value">
                    <b className={`${tone}-text`}>
                      {r.currentAttenuation} <small>dBm</small>
                    </b>
                    <p>{status}</p>
                  </div>
                  <button className="button" onClick={() => setSelectedTicket(r)}>
                    Lihat laporan →
                  </button>
                </div>
              );
            })}
        </div>

        {!filtered.length && (
          <p className="empty">Tidak ada laporan sinyal di kategori ini.</p>
        )}

        <div className="info-strip">
          Koneksi SSE aktif ke /api/v1/admin/stream/reports dengan header X-Accel-Buffering: no. Data diperbarui seketika saat teknisi submit laporan.
        </div>
      </section>

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </main>
  );
}
