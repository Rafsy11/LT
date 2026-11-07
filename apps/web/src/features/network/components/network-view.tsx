'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CustomerDetailModal } from '@/features/customers';
import { CreateTicketModal } from '@/features/tickets/components/create-ticket-modal';
import { useNetwork } from '../hooks/use-network';
import { NetworkStats } from './network-stats';
import { ClusterSelector } from './cluster-selector';
import { SplitterPortGrid } from './splitter-port-grid';
import { PortDetailPanel } from './port-detail-panel';

export function NetworkView() {
  const {
    search,
    setSearch,
    clusterGroups,
    expandedClusters,
    toggleClusterExpand,
    loading,
    portFilter,
    setPortFilter,
    activeTab,
    setActiveTab,
    expandedPortNum,
    setExpandedPortNum,
    selectedCustomerForModal,
    setSelectedCustomerForModal,
    historyTypeFilter,
    setHistoryTypeFilter,
    auditRunning,
    auditTimestamp,
    ticketModalOpen,
    setTicketModalOpen,
    ticketModalInitial,
    setTicketModalInitial,
    networkStats,
    filteredClusters,
    activeSplitter,
    activeSplitterFilteredPorts,
    setActiveSplitterCode,
    getAttenuationMeta,
    odpHistoryLogs,
    handleCreateTicketSubmit,
    handlePortClick,
    handleRunAudit,
    showSuccess,
    canCreateTicket,
    fetchClusters,
  } = useNetwork();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchClusters();
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchClusters]);

  return (
    <main className="network-page-container">
      {/* Header Section matching Lintasarta FTTH Network Dashboard reference */}
      <header className="network-header-v2">
        <div className="network-header-titles">
          <h1 className="network-main-title">Master Jaringan & Splitter ODP</h1>
          <p className="network-sub-title">
            Data master jaringan FTTH, daftar ODP, splitter, dan informasi port secara terpusat.
          </p>
        </div>
      </header>

      {/* 3 Metric Cards Computed Directly from Live Network Matrix */}
      <NetworkStats networkStats={networkStats} />

      {/* Main Content Area: Master-Detail Console View OR Balanced 2x2 Grid View */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: '20px' }}>
          <aside className="panel skeleton-card" style={{ height: '480px', padding: '16px' }}>
            <Skeleton width={140} height={18} style={{ marginBottom: '14px' }} />
            <Skeleton width="100%" height={32} borderRadius={6} style={{ marginBottom: '14px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Skeleton width="100%" height={44} borderRadius={6} />
              <Skeleton width="100%" height={44} borderRadius={6} />
              <Skeleton width="100%" height={44} borderRadius={6} />
              <Skeleton width="100%" height={44} borderRadius={6} />
            </div>
          </aside>
          <section className="odp-main-panel-card skeleton-card" style={{ height: '480px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton width={40} height={40} borderRadius={8} />
                <div>
                  <Skeleton width={200} height={20} style={{ marginBottom: '4px' }} />
                  <Skeleton width={260} height={13} />
                </div>
              </div>
              <Skeleton width={140} height={28} borderRadius={6} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {Array.from({ length: 16 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={56} borderRadius={6} />
              ))}
            </div>
            <Skeleton width="100%" height={160} borderRadius={8} />
          </section>
        </div>
      ) : filteredClusters.length === 0 ? (
        <div className="empty-state-card">
          <p style={{ fontWeight: 600, color: 'inherit' }}>
            Tidak ada splitter yang cocok dengan filter pencarian.
          </p>
          <p style={{ fontSize: '12px', color: 'inherit', opacity: 0.75, marginTop: '4px' }}>
            Coba ubah kata kunci atau reset filter cluster.
          </p>
        </div>
      ) : (
        <div className="network-main-grid">
          {/* Left Panel: Struktur Wilayah (Clean Tree, No Emojis, No Progress Percentages) */}
          <ClusterSelector
            search={search}
            setSearch={setSearch}
            clusterGroups={clusterGroups}
            expandedClusters={expandedClusters}
            toggleClusterExpand={toggleClusterExpand}
            activeSplitter={activeSplitter}
            setActiveSplitterCode={setActiveSplitterCode}
            setExpandedPortNum={setExpandedPortNum}
          />

          {/* Right Column: Active ODP Command Deck */}
          {activeSplitter && (
            <section
              className="odp-main-panel-card"
              aria-label={`Detail ODP ${activeSplitter.name}`}
            >
              {/* Top Header for Selected ODP (Clean, No Progress Bar, No Percentage) */}
              <header className="odp-hardware-chassis-top">
                <div className="odp-id-left-group">
                  <div className="odp-switch-icon-box">
                    <Icon name="network" size={20} />
                  </div>
                  <div>
                    <div className="odp-title-status-row">
                      <h2 className="odp-name-heading">
                        {activeSplitter.name} / {activeSplitter.splitterCode}
                      </h2>
                      <span className="odp-status-badge-active">Aktif</span>
                    </div>
                    <p className="odp-sub-specs-line">
                      <span>Cluster: {activeSplitter.clusterCode}</span>
                      <span>·</span>
                      <span>
                        Koordinat: {activeSplitter.lat.toFixed(4)}, {activeSplitter.lng.toFixed(4)}
                      </span>
                      <span>·</span>
                      <span>
                        Splitter: {activeSplitter.maxPorts === 8 ? '1x8 PLC' : '1x16 PLC'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="odp-header-right-stats">
                  <div className="odp-port-summary-clean">
                    <span>Total Port {activeSplitter.maxPorts}</span>
                    <span className="sep">|</span>
                    <span>Terisi {activeSplitter.usedPorts}</span>
                    <span className="sep">|</span>
                    <span>Siap PSB {activeSplitter.maxPorts - activeSplitter.usedPorts}</span>
                  </div>
                  <button
                    type="button"
                    className="odp-more-menu-btn"
                    title="Opsi ODP"
                    aria-label={`Opsi ODP ${activeSplitter.splitterCode}`}
                    onClick={() =>
                      showSuccess(`ODP ${activeSplitter.splitterCode} beroperasi normal.`)
                    }
                  >
                    ⋮
                  </button>
                </div>
              </header>

              {/* Navigation Tabs matching reference */}
              <nav className="odp-navigation-tabs-bar" role="tablist" aria-label="Tab navigasi ODP">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ports'}
                  className={`odp-nav-tab-btn ${activeTab === 'ports' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('ports')}
                >
                  Port & Pelanggan
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'inspeksi'}
                  className={`odp-nav-tab-btn ${activeTab === 'inspeksi' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('inspeksi')}
                >
                  Inspeksi
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'riwayat'}
                  className={`odp-nav-tab-btn ${activeTab === 'riwayat' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('riwayat')}
                >
                  Riwayat
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'audit'}
                  className={`odp-nav-tab-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  Audit
                </button>
              </nav>

              {activeTab === 'ports' && (
                <SplitterPortGrid
                  activeSplitter={activeSplitter}
                  activeSplitterFilteredPorts={activeSplitterFilteredPorts}
                  portFilter={portFilter}
                  setPortFilter={setPortFilter}
                  expandedPortNum={expandedPortNum}
                  setExpandedPortNum={setExpandedPortNum}
                  getAttenuationMeta={getAttenuationMeta}
                  handlePortClick={handlePortClick}
                  setSelectedCustomerForModal={setSelectedCustomerForModal}
                  setTicketModalInitial={setTicketModalInitial}
                  setTicketModalOpen={setTicketModalOpen}
                  canCreateTicket={canCreateTicket}
                />
              )}

              {activeTab !== 'ports' && (
                <PortDetailPanel
                  activeTab={activeTab}
                  activeSplitter={activeSplitter}
                  getAttenuationMeta={getAttenuationMeta}
                  historyTypeFilter={historyTypeFilter}
                  setHistoryTypeFilter={setHistoryTypeFilter}
                  odpHistoryLogs={odpHistoryLogs}
                  auditRunning={auditRunning}
                  auditTimestamp={auditTimestamp}
                  handleRunAudit={handleRunAudit}
                  showSuccess={showSuccess}
                  setTicketModalInitial={setTicketModalInitial}
                  setTicketModalOpen={setTicketModalOpen}
                  canCreateTicket={canCreateTicket}
                />
              )}
            </section>
          )}
        </div>
      )}

      {/* Customer Detail Modal Integration */}
      {selectedCustomerForModal && (
        <CustomerDetailModal
          customer={selectedCustomerForModal}
          onClose={() => setSelectedCustomerForModal(null)}
        />
      )}

      {/* Integrated Ticket Dispatcher Modal */}
      <CreateTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        onSubmit={handleCreateTicketSubmit}
        initialValues={ticketModalInitial}
      />
    </main>
  );
}
