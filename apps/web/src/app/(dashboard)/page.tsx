'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { dbmTone } from '@repo/shared';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';

export default function OverviewPage() {
  const [cluster, setCluster] = useState('Semua cluster');
  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  const { canCreateTicket } = useAuth();
  const { showError } = useToast();
  const [feedItems, setFeedItems] = useState<any[]>([
    {
      id: 'f-1',
      title: 'Gangguan koneksi - Critical',
      clusterLine: 'Cluster Bandung Utara - ODP-017A',
      customerLine: 'Pelanggan: PT. Maju Jaya',
      tag: 'Gangguan Jaringan',
      tagType: 'critical',
      timeAgo: '09:42',
      type: 'critical',
    },
    {
      id: 'f-2',
      title: 'Tiket maintenance ditugaskan',
      clusterLine: 'SLA100245 - Bandung Barat',
      customerLine: 'Teknisi: Fajar Hidayat',
      tag: 'Maintenance',
      tagType: 'warning',
      timeAgo: '09:15',
      type: 'warning',
    },
    {
      id: 'f-3',
      title: 'Pemulihan layanan',
      clusterLine: 'Cluster Cimahi - ODP-003B',
      customerLine: 'Layanan kembali normal',
      tag: 'Jaringan',
      tagType: 'success',
      timeAgo: '08:56',
      type: 'success',
    },
    {
      id: 'f-4',
      title: 'Tiket baru dibuat',
      clusterLine: 'SLA100244 - Rancaekek',
      customerLine: 'Pelanggan: CV. Sinar Abadi',
      tag: 'Helpdesk',
      tagType: 'info',
      timeAgo: '08:32',
      type: 'info',
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
    } catch (e: unknown) {
      showError(e);
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
      } catch (err: unknown) {
        showError(err);
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
      throw json.error;
    }
    fetchTickets();
  };

  const handleMarkCompleted = async (ticketNumber: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketNumber === ticketNumber ? { ...t, status: 'Selesai' } : t))
    );
  };

  const [statusFilter, setStatusFilter] = useState('Semua');

  const filteredTickets = tickets.filter((t) => {
    const matchesCluster = cluster === 'Semua cluster' || t.cluster === cluster;
    const matchesStatus =
      statusFilter === 'Semua' ||
      (statusFilter === 'Menunggu' && t.status === 'Menunggu') ||
      (statusFilter === 'Dalam proses' && (t.status === 'Dalam proses' || t.status === 'Proses')) ||
      (statusFilter === 'Selesai' && t.status === 'Selesai');
    const matchesQuery =
      query === '' ||
      t.ticketNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.customerName.toLowerCase().includes(query.toLowerCase()) ||
      t.siaNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.cluster.toLowerCase().includes(query.toLowerCase()) ||
      t.assignedTech.toLowerCase().includes(query.toLowerCase());
    return matchesCluster && matchesStatus && matchesQuery;
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

  const waitingCount = tickets.filter((t) => t.status === 'Menunggu').length;
  const inProgressCount = tickets.filter((t) => t.status === 'Dalam proses' || t.status === 'Proses').length;
  const completedCount = tickets.filter((t) => t.status === 'Selesai').length;

  return (
    <main className="overview-page">
      {/* Page Header with Integrated Command Bar matching image.png */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Selamat datang, Budi Santoso</h1>
          <p className="overview-subtitle">
            Berikut adalah ringkasan kondisi jaringan dan aktivitas operasional hari ini.
          </p>
        </div>

        <div className="overview-toolbar">
          <div className="date-time-badge" title="Waktu operasional aktif">
            <Icon name="clock" size={14} />
            <span>Senin, 24 Februari 2025</span>
            <span className="time-text">10:24 WIB</span>
          </div>

          <div className="select-wrapper">
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Pilih cluster"
              className="cluster-select"
            >
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
              <option>Cimahi</option>
              <option>Rancaekek</option>
            </select>
          </div>

          <button className="button primary export-btn" onClick={exportCsv} type="button">
            <Icon name="download" size={14} />
            <span>Export laporan</span>
          </button>

          {canCreateTicket ? (
            <button
              className="button primary buat-tiket-btn"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              <Icon name="plus" size={14} />
              <span>Buat Tiket</span>
            </button>
          ) : (
            <button
              className="button disabled buat-tiket-btn"
              disabled
              title="Izin ticket:create diperlukan untuk membuat tiket baru"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              type="button"
            >
              <Icon name="lock" size={13} />
              <span>Buat Tiket</span>
            </button>
          )}

          <button
            className="refresh-btn"
            onClick={fetchTickets}
            type="button"
            aria-label="Perbarui data"
            title="Perbarui data"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metric Cards */}
      <section className="overview-stats-grid" aria-label="Ringkasan Operasional Utama">
        {/* Metric 1: Pelanggan Aktif */}
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round">
                <Icon name="network" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Pelanggan aktif</span>
                <div className="stat-card-value">428</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="trend positive">↑ +12</span>
              <span className="caption">dari bulan lalu</span>
            </div>
          </div>
        </article>

        {/* Metric 2: Tiket Aktif */}
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="ticket" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Tiket aktif</span>
                <div className="stat-card-value">3</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="highlight-pill blue-pill">1 menunggu</span>
              <span className="caption">penugasan teknisi</span>
            </div>
          </div>
        </article>

        {/* Metric 3: Teknisi di Lapangan */}
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="wrench" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Teknisi di lapangan</span>
                <div className="stat-card-value">186</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">dari 200 teknisi terdaftar</span>
            </div>
          </div>
        </article>

        {/* Metric 4: Kesehatan Jaringan */}
        <article className="stat-card stat-card-health">
          <div className="stat-card-inner">
            <div className="stat-card-top health-top">
              <div className="health-left">
                <span className="stat-card-icon-round neutral">
                  <Icon name="shield" size={17} />
                </span>
                <div className="stat-card-text">
                  <span className="stat-card-label">Kesehatan jaringan</span>
                  <div className="stat-card-value">96.8%</div>
                </div>
              </div>
              <svg className="health-sparkline-svg" width="92" height="32" viewBox="0 0 92 32" fill="none" aria-hidden="true">
                <path
                  d="M2 27L15 24L26 26L38 16L50 19L62 10L76 8L90 4"
                  stroke="#1b5ca2"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="stat-card-footer">
              <span className="trend positive">↑ +2.4%</span>
              <span className="caption">dari minggu lalu</span>
            </div>
          </div>
        </article>
      </section>

      {/* Middle Grid: Sebaran Jaringan & Aktivitas Terbaru */}
      <div className="overview-middle-grid">
        {/* GIS Map Panel */}
        <section className="panel overview-map-panel" aria-label="Peta Sebaran Jaringan FTTH">
          <div className="panel-inner">
            <div className="panel-heading">
              <div>
                <h2>Sebaran Jaringan</h2>
                <p>Visibilitas seluruh cluster dan titik ODP</p>
              </div>
              <Link href="/network" className="link-arrow">
                <span>Lihat jaringan</span>
                <span className="arrow-sym">→</span>
              </Link>
            </div>

            <div className="clean-map-container">
              <svg
                viewBox="0 0 800 300"
                preserveAspectRatio="xMidYMid slice"
                className="clean-map-svg"
                role="img"
                aria-label="Peta topologi cluster fiber dan sebaran ODP Kota Bandung"
              >
                <defs>
                  <pattern id="cleanGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e8f2f8" strokeWidth="0.8" opacity="0.8" />
                  </pattern>
                </defs>

                {/* Base Surface */}
                <rect width="800" height="300" fill="#f7fafd" />
                <rect width="800" height="300" fill="url(#cleanGrid)" />

                {/* River / Fiber Spine Arterial Trace */}
                <path
                  d="M80 0Q150 80 310 100T440 210T780 300"
                  fill="none"
                  stroke="#e0edf7"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <path
                  d="M80 0Q150 80 310 100T440 210T780 300"
                  fill="none"
                  stroke="#bfdaf0"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {/* Road Network Grid Lines */}
                <path
                  d="M0 230 800 60 M270 0 500 300 M0 80 800 190"
                  stroke="#ffffff"
                  strokeWidth="8"
                />
                <path
                  d="M0 230 800 60 M270 0 500 300 M0 80 800 190"
                  stroke="#e5eef5"
                  strokeWidth="2.5"
                />

                {/* Cluster Zones with Lintasarta Blue Polygons */}
                <polygon
                  points="140,45 285,35 330,130 220,190 120,140"
                  fill="#1b5ca2"
                  fillOpacity="0.06"
                  stroke="#1b5ca2"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
                <polygon
                  points="440,65 640,80 695,200 550,230 425,165"
                  fill="#1b5ca2"
                  fillOpacity="0.06"
                  stroke="#1b5ca2"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />

                {/* ODP Distribution Nodes */}
                {[
                  { x: 200, y: 80, status: 'normal' },
                  { x: 270, y: 130, status: 'normal' },
                  { x: 170, y: 150, status: 'normal' },
                  { x: 490, y: 110, status: 'normal' },
                  { x: 580, y: 160, status: 'critical' },
                  { x: 630, y: 120, status: 'warning' },
                  { x: 365, y: 225, status: 'normal' },
                  { x: 430, y: 190, status: 'normal' },
                  { x: 550, y: 250, status: 'normal' },
                ].map((node, i) => {
                  const isCrit = node.status === 'critical';
                  const isWarn = node.status === 'warning';
                  const fillDot = isCrit ? '#dc2626' : isWarn ? '#f59e0b' : '#16a34a';
                  const halo = isCrit ? '#fee2e2' : isWarn ? '#fef3c7' : '#dcfce7';

                  return (
                    <g key={i}>
                      <circle cx={node.x} cy={node.y} r={isCrit ? '12' : '9'} fill={halo} />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="4"
                        fill={fillDot}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}

                {/* Topographic Typography matching image.png */}
                <g fill="#475569" fontSize="13" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                  <text x="330" y="38" fill="#334155" fontWeight="600">Bandung Utara</text>
                  <text x="305" y="152" fontSize="16" fontWeight="800" fill="#0f172a">Bandung</text>
                  <text x="75" y="210" fill="#64748b" fontWeight="500">Sukajadi</text>
                  <text x="560" y="240" fill="#64748b" fontWeight="500">Antapani</text>
                </g>
              </svg>

              {/* Floating HUD Badges */}
              <div className="map-hud-top">
                <span className="map-hud-pill">
                  <span className="status-dot green" />
                  <b>12 cluster aktif</b>
                  <span className="sep">·</span>
                  <span>64 titik ODP</span>
                </span>
              </div>

              {/* Floating Zoom Controls matching image.png */}
              <div className="map-zoom-controls">
                <button type="button" className="map-zoom-btn" aria-label="Zoom in">+</button>
                <button type="button" className="map-zoom-btn" aria-label="Zoom out">−</button>
                <button type="button" className="map-zoom-btn compass" aria-label="Reset arah">
                  <Icon name="compass" size={13} />
                </button>
              </div>

              <div className="map-hud-bottom">
                <div className="map-legend-pills">
                  <span className="legend-item"><i className="legend-dot green-bg" /> Normal</span>
                  <span className="legend-item"><i className="legend-dot amber-bg" /> Warning</span>
                  <span className="legend-item"><i className="legend-dot red-bg" /> Critical</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live SSE Telemetry Feed matching image.png */}
        <section className="panel overview-feed-panel" aria-label="Feed Aktivitas Lapangan Real-time">
          <div className="panel-inner">
            <div className="panel-heading">
              <div className="panel-heading-left">
                <h2>
                  Aktivitas terbaru{' '}
                  <span className="live-feed-badge">
                    <span className="status-dot green" />
                    LIVE
                  </span>
                </h2>
              </div>
              <Link href="/monitoring" className="link-arrow">
                <span>Lihat semua</span>
                <span className="arrow-sym">→</span>
              </Link>
            </div>

            <div className="feed-stream">
              {feedItems.slice(0, 4).map((item) => (
                <div className="feed-stream-item" key={item.id}>
                  <div className={`feed-stream-icon ${item.type}`}>
                    <Icon
                      name={
                        item.type === 'critical'
                          ? 'activity'
                          : item.type === 'warning'
                          ? 'wrench'
                          : item.type === 'success'
                          ? 'check'
                          : 'fileText'
                      }
                      size={15}
                    />
                  </div>
                  <div className="feed-stream-body">
                    <div className="feed-stream-top-row">
                      <b className="feed-stream-title">{item.title}</b>
                      <span className="feed-stream-time">{item.timeAgo}</span>
                    </div>
                    <p className="feed-stream-subtitle">{item.clusterLine}</p>
                    <p className="feed-stream-subtitle muted-line">{item.customerLine}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Ticket & Work Order Data Table matching image.png */}
      <section className="panel overview-table-panel" aria-label="Daftar Tiket dan Work Order">
        <div className="panel-inner">
          <div className="panel-heading table-panel-header">
            <div className="table-header-left">
              <div className="table-title-row">
                <h2>Tiket & Work Order</h2>
                <span className="table-count-badge">32</span>
              </div>
              <p>Kelola dan pantau progres pekerjaan tim Anda</p>
            </div>

            <div className="table-header-controls">
              {/* Quick Status Filter Tabs */}
              <div className="status-tabs" role="tablist" aria-label="Filter status tiket">
                {['Semua', 'Menunggu', 'Dalam proses', 'Selesai'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === st}
                    className={`status-tab-btn ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="table-search-box">
                <Icon name="search" size={14} />
                <input
                  placeholder="Cari tiket atau pelanggan..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Cari tiket atau pelanggan"
                />
              </div>

              {/* Filter Button */}
              <button className="button-filter" type="button" aria-label="Buka filter lanjutan">
                <Icon name="filter" size={14} />
                <span>Filter &gt;</span>
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="lintasarta-table">
              <thead>
                <tr>
                  <th>NO. TIKET</th>
                  <th>PELANGGAN</th>
                  <th>TIPE PEKERJAAN</th>
                  <th>CLUSTER</th>
                  <th>TEKNISI</th>
                  <th>STATUS</th>
                  <th>PRIORITAS</th>
                  <th>REDAMAN</th>
                  <th aria-label="Aksi" />
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((r) => {
                  const priorityMap: Record<string, string> = {
                    High: 'Tinggi',
                    Normal: 'Normal',
                    Low: 'Rendah',
                    Critical: 'Kritis',
                    high: 'Tinggi',
                    normal: 'Normal',
                    low: 'Rendah',
                    critical: 'Kritis',
                    Tinggi: 'Tinggi',
                    Rendah: 'Rendah',
                    Kritis: 'Kritis',
                  };
                  const priorityLabel = priorityMap[r.priority] || r.priority || 'Normal';

                  return (
                    <tr key={r.id || r.ticketNumber} onClick={() => setSelectedTicket(r)}>
                      <td className="ticket-id-link">{r.ticketNumber}</td>
                      <td>
                        <b className="customer-name">{r.customerName}</b>
                        <small className="sia-code">{r.siaNumber}</small>
                      </td>
                      <td>
                        <span
                          className={`type-chip ${
                            r.ticketType === 'Pasang baru'
                              ? 'chip-blue'
                              : r.ticketType === 'Perbaikan'
                              ? 'chip-amber'
                              : r.ticketType === 'Maintenance'
                              ? 'chip-purple'
                              : 'chip-blue'
                          }`}
                        >
                          {r.ticketType}
                        </span>
                      </td>
                      <td className="cluster-text">{r.cluster}</td>
                      <td>
                        <div className="tech-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <DefaultAvatar size={24} name={r.assignedTech} />
                          <span className="tech-name">{r.assignedTech}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-chip-pill ${
                            r.status === 'Selesai'
                              ? 'green'
                              : r.status === 'Menunggu'
                              ? 'neutral'
                              : 'blue'
                          }`}
                        >
                          <i className="status-chip-dot" />
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                          {priorityLabel}
                        </span>
                      </td>
                      <td className="attenuation-cell">
                        <span className="muted-dash">-</span>
                      </td>
                      <td className="action-col-dots">
                        <span className="more-dots">⋯</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredTickets.length && !loading && (
              <div className="table-empty-state">
                <Icon name="ticket" size={24} />
                <p>Tidak ada tiket yang cocok dengan kriteria filter.</p>
              </div>
            )}
          </div>

          <div className="table-footer-bar">
            <span>Menampilkan {filteredTickets.length} dari {tickets.length} tiket</span>
            <span>Master Data Terverifikasi · FiberOps On-Premise</span>
          </div>
        </div>
      </section>

      {/* Modals with Cybersecurity Hardening & Debounce */}
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
