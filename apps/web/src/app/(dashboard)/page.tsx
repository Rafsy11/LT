'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { dbmTone } from '@repo/shared';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';

export default function OverviewPage() {
  const [cluster, setCluster] = useState('Semua cluster');
  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [feedItems, setFeedItems] = useState<any[]>([
    {
      id: 'f-1',
      title: 'Redaman kritis terdeteksi',
      customerName: 'Budi Santoso',
      siaNumber: '100245',
      cluster: 'Bandung Utara',
      techName: 'Andi Pratama',
      timeAgo: '2 menit lalu',
      attenuation: -26.4,
      type: 'critical',
      isUnread: true,
    },
    {
      id: 'f-2',
      title: 'Pasang baru selesai',
      customerName: 'Siti Rahmawati',
      siaNumber: '100244',
      cluster: 'Bandung Timur',
      techName: 'Rizky Maulana',
      timeAgo: '8 menit lalu',
      attenuation: -19.2,
      type: 'success',
      isUnread: false,
    },
    {
      id: 'f-3',
      title: 'Tiket maintenance ditugaskan',
      customerName: 'Dedi Kurniawan',
      siaNumber: '100243',
      cluster: 'Bandung Barat',
      techName: 'Fajar Hidayat',
      timeAgo: '12 menit lalu',
      attenuation: -23.5,
      type: 'warning',
      isUnread: false,
    },
  ]);

  // Load tickets
  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/v1/admin/tickets');
      const json = await res.json();
      if (json.success) {
        setTickets(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();

    // Connect to SSE stream for live updates
    const eventSource = new EventSource('/api/v1/admin/stream/reports');

    eventSource.addEventListener('report', (e) => {
      try {
        const item = JSON.parse(e.data);
        setFeedItems((prev) => [
          {
            id: `f-${Date.now()}`,
            title: item.title,
            customerName: item.customerName,
            siaNumber: item.siaNumber,
            cluster: item.clusterName,
            techName: item.technicianName,
            timeAgo: 'Baru saja',
            attenuation: item.attenuationDbm,
            type: item.status === 'Critical' ? 'critical' : item.status === 'Normal' ? 'success' : 'warning',
            isUnread: true,
          },
          ...prev,
        ]);
        fetchTickets(); // Refresh tickets table
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleCreateTicket = async (data: any) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error?.message || 'Gagal membuat tiket');
    }
    fetchTickets();
  };

  const handleMarkCompleted = async (ticketNumber: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketNumber === ticketNumber ? { ...t, status: 'Selesai' } : t))
    );
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesCluster = cluster === 'Semua cluster' || t.cluster === cluster;
    const matchesQuery =
      query === '' ||
      t.ticketNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.customerName.toLowerCase().includes(query.toLowerCase()) ||
      t.siaNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.cluster.toLowerCase().includes(query.toLowerCase()) ||
      t.assignedTech.toLowerCase().includes(query.toLowerCase());
    return matchesCluster && matchesQuery;
  });

  const exportCsv = () => {
    const csvContent =
      'Tiket,Pelanggan,Nomor SIA,Tipe Pekerjaan,Cluster,Teknisi,Status,Redaman (dBm)\n' +
      filteredTickets
        .map((r) =>
          [r.ticketNumber, `"${r.customerName}"`, r.siaNumber, r.ticketType, r.cluster, r.assignedTech, r.status, r.currentAttenuation].join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-operasional-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PUSAT OPERASIONAL JARINGAN</div>
          <h1>Overview operasional</h1>
          <p>Pantau jaringan, tim lapangan, dan pekerjaan dalam satu tempat.</p>
        </div>
        <div className="heading-actions">
          <button className="button" onClick={exportCsv}>
            <Icon name="download" size={16} />
            Export laporan
          </button>
          <button className="button primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={17} />
            Buat tiket
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-left">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)}>
            <option>Semua cluster</option>
            <option>Bandung Utara</option>
            <option>Bandung Timur</option>
            <option>Bandung Barat</option>
            <option>Bandung Selatan</option>
          </select>
          <span className="filter-divider" />
          <Icon name="clock" size={16} />
          <span>Hari ini, 24 Februari 2025</span>
        </div>
        <span className="updated">
          <i className="green-dot" />
          Live feed aktif <span>·</span> Pembaruan otomatis
        </span>
      </div>

      {/* 4 Stats Cards */}
      <section className="stats">
        <article className="stat">
          <div className="stat-top">
            Pelanggan aktif
            <span className="stat-icon purple">
              <Icon name="users" size={18} />
            </span>
          </div>
          <div className="stat-value">428</div>
          <div className="stat-caption">
            <span className="positive">↗ +12</span> dari bulan lalu
          </div>
        </article>

        <article className="stat">
          <div className="stat-top">
            Tiket aktif
            <span className="stat-icon blue">
              <Icon name="ticket" size={18} />
            </span>
          </div>
          <div className="stat-value">{tickets.length}</div>
          <div className="stat-caption">
            <span>
              {tickets.filter((t) => t.status === 'Menunggu').length} menunggu
            </span>{' '}
            penugasan teknisi
          </div>
        </article>

        <article className="stat">
          <div className="stat-top">
            Teknisi di lapangan
            <span className="stat-icon orange">
              <Icon name="network" size={18} />
            </span>
          </div>
          <div className="stat-value">186</div>
          <div className="stat-caption">
            <span>dari 200</span> teknisi terdaftar
          </div>
        </article>

        <article className="stat">
          <div className="stat-top">
            Kesehatan jaringan
            <span className="stat-icon green">
              <Icon name="activity" size={18} />
            </span>
          </div>
          <div className="stat-value">
            96.8%
            <svg className="sparkline" width="100" height="34" viewBox="0 0 100 34">
              <path
                d="M1 29 13 24 22 27 33 16 44 21 53 12 65 17 77 7 87 11 99 2"
                stroke="#20a476"
                fill="none"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="stat-caption">
            <span className="positive">↗ +2.4%</span> dari minggu lalu
          </div>
        </article>
      </section>

      {/* Map & Live Feed Grid */}
      <div className="middle-grid">
        <section className="panel map-panel">
          <div className="panel-heading">
            <div>
              <h2>Sebaran jaringan</h2>
              <p>Visibilitas seluruh cluster dan titik ODP</p>
            </div>
            <Link href="/network" className="text-button">
              Lihat jaringan <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="map">
            <svg
              viewBox="0 0 800 300"
              preserveAspectRatio="xMidYMid slice"
              className="map-art"
            >
              <defs>
                <pattern
                  id="blocks"
                  width="65"
                  height="51"
                  patternTransform="rotate(-24)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="65" height="51" fill="#f0f1ed" />
                  <rect x="5" y="5" width="52" height="37" rx="4" fill="#e4e7df" />
                  <path d="M0 0h65v51" stroke="#fff" strokeWidth="7" />
                </pattern>
              </defs>
              <rect width="800" height="300" fill="url(#blocks)" />
              <path
                d="M80 0Q150 80 310 100T440 210T780 300"
                fill="none"
                stroke="#c6dddf"
                strokeWidth="17"
              />
              <path
                d="M0 230 800 60 M270 0 500 300 M0 80 800 190"
                stroke="#fff"
                strokeWidth="13"
              />
              <path
                d="M0 230 800 60 M270 0 500 300"
                stroke="#ecdcb9"
                strokeWidth="5"
              />
              <path
                d="M140 45 285 35 330 130 220 190 120 140Z"
                fill="#d9d2fa"
                fillOpacity=".6"
                stroke="#a89bd2"
                strokeDasharray="5 5"
              />
              <path
                d="M440 65 640 80 695 200 550 230 425 165Z"
                fill="#d9d2fa"
                fillOpacity=".6"
                stroke="#a89bd2"
                strokeDasharray="5 5"
              />
              {[
                [200, 80],
                [270, 130],
                [170, 150],
                [490, 110],
                [580, 160],
                [630, 120],
                [365, 225],
                [430, 190],
                [550, 250],
              ].map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="13" fill={i === 5 ? '#fff0e7' : '#eae4ff'} />
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill={i === 5 ? '#ed9655' : '#7b59ce'}
                    stroke="white"
                    strokeWidth="2"
                  />
                </g>
              ))}
              <g fill="#888d89" fontSize="12" fontFamily="Arial">
                <text x="200" y="25">BANDUNG UTARA</text>
                <text x="510" y="60">BANDUNG TIMUR</text>
                <text x="220" y="265">Cicendo</text>
                <text x="358" y="150" fontSize="16" fill="#747c78">Bandung</text>
                <text x="660" y="260">Antapani</text>
                <text x="70" y="200">Sukajadi</text>
              </g>
            </svg>
            <div className="map-label">
              <i className="green-dot" />
              12 cluster aktif <span>·</span> 64 titik ODP
            </div>
            <div className="map-legend">
              <span><i className="legend-dot purple-bg" /> Normal</span>
              <span><i className="legend-dot orange-bg" /> Warning</span>
              <span><i className="legend-dot red-bg" /> Critical</span>
            </div>
          </div>
        </section>

        <section className="panel feed-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Aktivitas terbaru{' '}
                <span className="live-badge">
                  <i className="green-dot" />
                  LIVE
                </span>
              </h2>
              <p>Laporan masuk dari tim lapangan via SSE</p>
            </div>
            <Link href="/monitoring" className="dots">
              ⋯
            </Link>
          </div>
          <div className="feed">
            {feedItems.slice(0, 3).map((item) => (
              <div className="feed-item" key={item.id}>
                <span className={`feed-icon ${item.type}`}>
                  <Icon
                    name={
                      item.type === 'critical'
                        ? 'activity'
                        : item.type === 'success'
                        ? 'check'
                        : 'ticket'
                    }
                    size={17}
                  />
                </span>
                <div>
                  <b>{item.title}</b>
                  <p>
                    {item.customerName} <span>·</span> SIA {item.siaNumber}
                  </p>
                  <div className="feed-detail">
                    <span
                      className={`badge ${
                        item.type === 'critical'
                          ? 'red'
                          : item.type === 'success'
                          ? 'green'
                          : 'blue'
                      }`}
                    >
                      {item.attenuation} dBm
                    </span>
                    <small>{item.cluster}</small>
                  </div>
                  <small>
                    {item.techName} · {item.timeAgo}
                  </small>
                </div>
                {item.isUnread && <i className="unread" />}
              </div>
            ))}
          </div>
          <Link href="/monitoring" className="feed-footer">
            Lihat semua aktivitas <Icon name="chevron" size={14} />
          </Link>
        </section>
      </div>

      {/* Ticket Table */}
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Tiket & work order <span className="count">{filteredTickets.length}</span>
            </h2>
            <p>Kelola dan pantau progres pekerjaan tim Anda</p>
          </div>
          <div className="table-tools">
            <div className="search">
              <Icon name="search" size={16} />
              <input
                placeholder="Cari tiket atau pelanggan..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Link href="/tickets" className="text-button">
              Lihat semua <Icon name="chevron" size={14} />
            </Link>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>No. tiket</th>
                <th>Pelanggan</th>
                <th>Tipe pekerjaan</th>
                <th>Cluster</th>
                <th>Teknisi</th>
                <th>Status</th>
                <th>Redaman</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((r) => (
                <tr key={r.id || r.ticketNumber} onClick={() => setSelectedTicket(r)}>
                  <td className="ticket-id">{r.ticketNumber}</td>
                  <td>
                    <b>{r.customerName}</b>
                    <small>SIA {r.siaNumber}</small>
                  </td>
                  <td>
                    <span
                      className={`type-badge ${
                        r.ticketType === 'Pasang baru' ? 'install' : ''
                      }`}
                    >
                      {r.ticketType}
                    </span>
                  </td>
                  <td>{r.cluster}</td>
                  <td>
                    <div className="tech">
                      <span className="mini-avatar">{r.techInitials}</span>
                      {r.assignedTech}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === 'Selesai'
                          ? 'green'
                          : r.status === 'Menunggu'
                          ? 'neutral'
                          : 'blue'
                      }`}
                    >
                      <i />
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${dbmTone(r.currentAttenuation)}-text`}>
                      {r.currentAttenuation} <small className="inline">dBm</small>
                    </span>
                  </td>
                  <td>
                    <Icon name="chevron" size={15} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredTickets.length && !loading && (
            <p className="empty">Tidak ada tiket yang cocok dengan pencarian.</p>
          )}
        </div>
        <div className="table-footer">
          Menampilkan {filteredTickets.length} dari {tickets.length} tiket{' '}
          <span>Master Data Terverifikasi · FiberOps On-Premise</span>
        </div>
      </section>

      {/* Modals */}
      <CreateTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateTicket}
      />

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onMarkCompleted={handleMarkCompleted}
      />
    </main>
  );
}
