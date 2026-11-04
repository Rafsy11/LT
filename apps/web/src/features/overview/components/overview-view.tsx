'use client';

import React, { useState, useRef, useEffect } from 'react';
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

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActionMenuOpen(false);
      }
    }
    if (actionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionMenuOpen]);

  useEffect(() => {
    function handleGlobalRefresh() {
      fetchTickets();
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchTickets]);

  return (
    <main className="overview-page" id="main-content">
      {/* Page Header with Reorganized Command Bar (Stage 2) */}
      <header className="overview-header">
        <div className="overview-header-left">
          <div className="overview-datetime-header" title="Waktu operasional aktif">
            <span className="overview-date-title">{currentDateTime.date || 'Rabu, 4 November 2026'}</span>
            <span className="overview-time-title">{currentDateTime.time || '10.12 WIB'}</span>
          </div>

          <div className="select-wrapper overview-cluster-select-wrap">
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
        </div>

        <div className="overview-header-right">
          {/* Consolidated Action Menu (Accordion / Dropdown) */}
          <div className="overview-action-accordion" ref={actionMenuRef}>
            <button
              type="button"
              className={`button primary overview-action-trigger ${actionMenuOpen ? 'open' : ''}`}
              onClick={() => setActionMenuOpen((prev) => !prev)}
              aria-expanded={actionMenuOpen}
              aria-haspopup="menu"
            >
              <Icon name="plus" size={14} />
              <span>Menu Tindakan</span>
              <Icon
                name="chevron"
                size={14}
                className={`accordion-chevron ${actionMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {actionMenuOpen && (
              <div className="overview-action-dropdown" role="menu">
                {canCreateTicket ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="action-dropdown-item"
                    onClick={() => {
                      setModalOpen(true);
                      setActionMenuOpen(false);
                    }}
                  >
                    <div className="action-item-icon create">
                      <Icon name="plus" size={15} />
                    </div>
                    <div className="action-item-info">
                      <span className="action-item-title">Buat Tiket Baru</span>
                      <span className="action-item-desc">Registrasi tiket PSB atau maintenance</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    className="action-dropdown-item disabled"
                    title="Izin ticket:create diperlukan"
                  >
                    <div className="action-item-icon locked">
                      <Icon name="lock" size={14} />
                    </div>
                    <div className="action-item-info">
                      <span className="action-item-title">Buat Tiket Baru</span>
                      <span className="action-item-desc">Akses terbatas (izin diperlukan)</span>
                    </div>
                  </button>
                )}

                <div className="action-dropdown-divider" />

                <button
                  type="button"
                  role="menuitem"
                  className="action-dropdown-item"
                  onClick={() => {
                    exportCsv();
                    setActionMenuOpen(false);
                  }}
                >
                  <div className="action-item-icon export">
                    <Icon name="download" size={15} />
                  </div>
                  <div className="action-item-info">
                    <span className="action-item-title">Export Laporan</span>
                    <span className="action-item-desc">Unduh berkas rekapitulasi data (CSV)</span>
                  </div>
                </button>
              </div>
            )}
          </div>


        </div>
      </header>

      {/* 4 Telemetry Metric Cards */}
      <OverviewStats
        customerCount={customerCount}
        activeTicketsCount={activeTicketsCount}
        waitingTicketsCount={waitingTicketsCount}
        techStats={techStats}
        networkHealthPct={networkHealthPct}
      />

      {/* Middle Grid: Sebaran Jaringan & Aktivitas Terbaru */}
      <section className="overview-middle-grid" aria-label="Peta Topologi & Telemetri">
        <OverviewNetworkMap />
        <OverviewTelemetryFeed feedItems={feedItems} />
      </section>

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
