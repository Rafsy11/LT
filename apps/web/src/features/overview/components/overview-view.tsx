'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { CreateTicketModal, TicketDetailModal } from '@/features/tickets';
import { useOverview } from '../hooks/use-overview';
import { OverviewStats } from './overview-stats';
import { OverviewNetworkMap } from './overview-network-map';
import { OverviewTelemetryFeed } from './overview-telemetry-feed';
import { OverviewTicketQueue } from './overview-ticket-queue';

export function OverviewView() {
  const {
    cluster,
    setCluster,
    query,
    setQuery,
    tickets,
    loading,
    modalOpen,
    setModalOpen,
    selectedTicket,
    setSelectedTicket,
    customerCount,
    techStats,
    currentDateTime,
    statusFilter,
    setStatusFilter,
    feedItems,
    canCreateTicket,
    user,
    filteredTickets,
    activeTicketsCount,
    waitingTicketsCount,
    networkHealthPct,
    fetchTickets,
    handleCreateTicket,
    handleMarkCompleted,
    exportCsv,
  } = useOverview();

  return (
    <main className="overview-page">
      {/* Page Header with Integrated Command Bar */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Selamat datang, {user.fullName || 'Operator'}</h1>
          <p className="overview-subtitle">
            Berikut adalah ringkasan kondisi jaringan dan aktivitas operasional hari ini.
          </p>
        </div>

        <div className="overview-toolbar">
          <div className="date-time-badge" title="Waktu operasional aktif">
            <Icon name="clock" size={14} />
            <span>{currentDateTime.date || 'Waktu Operasional'}</span>
            <span className="time-text">{currentDateTime.time || 'WIB'}</span>
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
      <OverviewStats
        customerCount={customerCount}
        activeTicketsCount={activeTicketsCount}
        waitingTicketsCount={waitingTicketsCount}
        techStats={techStats}
        networkHealthPct={networkHealthPct}
      />

      {/* Middle Grid: Sebaran Jaringan & Aktivitas Terbaru */}
      <div className="overview-middle-grid">
        <OverviewNetworkMap />
        <OverviewTelemetryFeed feedItems={feedItems} />
      </div>

      {/* Ticket & Work Order Data Table */}
      <OverviewTicketQueue
        tickets={tickets}
        filteredTickets={filteredTickets}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        query={query}
        setQuery={setQuery}
        loading={loading}
        onSelectTicket={setSelectedTicket}
      />

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

