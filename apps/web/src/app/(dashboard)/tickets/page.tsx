'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';

export default function TicketsPage() {
  const [tab, setTab] = useState('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [tickets, setTickets] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  const { canCreateTicket } = useAuth();
  const { showError } = useToast();

  const fetchTickets = () => {
    fetch('/api/v1/admin/tickets')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setTickets(json.data);
      })
      .catch((err) => showError(err));
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (data: any) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw json.error;
    fetchTickets();
  };

  const handleMarkCompleted = (ticketNumber: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.ticketNumber === ticketNumber ? { ...t, status: 'Selesai' } : t))
    );
  };

  const scoped = tickets.filter((r) => {
    const matchesCluster = cluster === 'Semua cluster' || r.cluster === cluster;
    const matchesSearch =
      search === '' ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.assignedTech.toLowerCase().includes(search.toLowerCase());
    return matchesCluster && matchesSearch;
  });

  const filtered = scoped.filter((r) => tab === 'Semua' || r.status === tab);

  const waitingCount = scoped.filter((r) => r.status === 'Menunggu').length;
  const inProgressCount = scoped.filter((r) => r.status === 'Dalam proses').length;
  const completedCount = scoped.filter((r) => r.status === 'Selesai').length;

  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>Tiket & Work Order</h1>
          <p>Disposisi pekerjaan pasang baru (PSB) dan pemeliharaan (Maintenance) ke teknisi lapangan.</p>
        </div>
        <div className="heading-actions">
          {/* Conditional Rendering Berdasarkan Permission Matrix (Requirement 3) */}
          {canCreateTicket ? (
            <button className="button primary" onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={17} />
              Buat tiket baru
            </button>
          ) : (
            <button
              className="button disabled"
              disabled
              title="Izin ticket:create diperlukan untuk membuat tiket baru"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              🔒 Buat tiket (Perlu Izin)
            </button>
          )}
        </div>
      </div>

      <section className="stats page-stats">
        <article className="stat">
          <div className="stat-top">Total Work Order</div>
          <div className="stat-value">{scoped.length}</div>
          <span className="demo-note">Semua penugasan aktif</span>
        </article>
        <article className="stat">
          <div className="stat-top">Menunggu</div>
          <div className="stat-value">{waitingCount}</div>
          <span className="demo-note">Menunggu respon teknisi</span>
        </article>
        <article className="stat">
          <div className="stat-top">Dalam proses</div>
          <div className="stat-value" style={{ color: '#5687ce' }}>{inProgressCount}</div>
          <span className="demo-note">Teknisi di lokasi</span>
        </article>
        <article className="stat">
          <div className="stat-top">Selesai</div>
          <div className="stat-value" style={{ color: '#25a47b' }}>{completedCount}</div>
          <span className="demo-note">Laporan telah diverifikasi</span>
        </article>
      </section>

      <section className="panel">
        <div className="page-toolbar">
          <div className="search">
            <span>⌕</span>
            <input
              aria-label="Cari tiket"
              placeholder="Cari tiket, pelanggan, teknisi..."
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
          {['Semua', 'Menunggu', 'Dalam proses', 'Selesai'].map((item) => (
            <button
              key={item}
              className={tab === item ? 'selected' : ''}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="work-list">
          {filtered.map((r) => (
            <button
              key={r.ticketNumber}
              className="work-card"
              onClick={() => setSelectedTicket(r)}
            >
              <div className="work-card-top">
                <span className="ticket-id">{r.ticketNumber}</span>
                <span
                  className={`badge ${
                    r.status === 'Selesai'
                      ? 'green'
                      : r.status === 'Menunggu'
                      ? 'neutral'
                      : 'blue'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <h3>{r.customerName}</h3>
              <p>
                SIA {r.siaNumber} · {r.ticketType}
              </p>
              <div className="work-card-bottom">
                <span>{r.cluster}</span>
                <span>{r.assignedTech} →</span>
              </div>
            </button>
          ))}
        </div>

        {!filtered.length && (
          <p className="empty">Tidak ada tiket pada kategori ini.</p>
        )}
      </section>

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
