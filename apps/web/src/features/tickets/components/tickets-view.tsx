'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { TicketsSkeleton } from '@/components/ui/PageSkeleton';
import { useTickets } from '../hooks/use-tickets';
import { TicketStats } from './ticket-stats';
import { TicketFilters } from './ticket-filters';
import { TicketGrid } from './ticket-grid';
import { CreateTicketModal } from './create-ticket-modal';
import { TicketDetailModal } from './ticket-detail-modal';

export function TicketsView() {
  const {
    tab,
    setTab,
    search,
    setSearch,
    cluster,
    setCluster,
    typeFilter,
    setTypeFilter,
    tickets,
    loading,
    modalOpen,
    setModalOpen,
    selectedTicket,
    setSelectedTicket,
    simulating,
    canCreateTicket,
    fetchTickets,
    handleCreateTicket,
    handleSimulateSubmission,
    scoped,
    filtered,
    waitingCount,
    inProgressCount,
    getDbmBadge,
  } = useTickets();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchTickets(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchTickets]);

  if (loading && tickets.length === 0) {
    return <TicketsSkeleton />;
  }

  return (
    <main className="tickets-page">
      {/* Page Heading matching Enterprise System */}
      <header className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">WORK ORDER & FIELD DISPATCH MANAGEMENT</div>
          <h1 className="overview-greeting">Tiket & Penugasan Lapangan</h1>
          <p className="overview-subtitle">
            Disposisi pekerjaan Pasang Baru (PSB) dan Pemeliharaan (Maintenance) ke teknisi
            lapangan.
          </p>
        </div>

        <nav className="overview-toolbar" aria-label="Aksi bilah status tiket">
          <button
            className="button secondary"
            onClick={handleSimulateSubmission}
            disabled={simulating}
            type="button"
            title="Terima data terbaru yang dikirim teknisi dari mobile app"
            style={{ fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="activity" size={14} />
            <span>{simulating ? 'Menerima Data...' : '+ Terima Data Teknisi (Mobile)'}</span>
          </button>

          {canCreateTicket ? (
            <button className="button primary" onClick={() => setModalOpen(true)} type="button">
              <Icon name="plus" size={15} />
              <span>Buat Tiket Baru</span>
            </button>
          ) : (
            <button
              className="button disabled"
              disabled
              title="Izin ticket:create diperlukan untuk membuat tiket baru"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              type="button"
            >
              <Icon name="lock" size={14} />
              <span>Buat Tiket (Terkunci)</span>
            </button>
          )}


        </nav>
      </header>

      {/* 4 Telemetry Metrics Grid (Harmonized with Overview) */}
      <TicketStats
        totalWorkOrder={scoped.length}
        waitingCount={waitingCount}
        inProgressCount={inProgressCount}
        completedCount={scoped.filter((t) => t.status === 'Selesai').length}
      />

      {/* Filter Toolbar & Segmented Status Tabs Bar */}
      <TicketFilters
        search={search}
        setSearch={setSearch}
        cluster={cluster}
        setCluster={setCluster}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        tab={tab}
        setTab={setTab}
        totalCount={scoped.length}
        waitingCount={waitingCount}
        inProgressCount={inProgressCount}
      />

      {/* Work Order Cards Grid */}
      <TicketGrid
        loading={loading}
        tickets={filtered}
        onSelectTicket={setSelectedTicket}
        getDbmBadge={getDbmBadge}
      />

      {/* Ticket Create Modal */}
      <CreateTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateTicket}
      />

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onTicketUpdated={() => fetchTickets(true)}
      />
    </main>
  );
}
