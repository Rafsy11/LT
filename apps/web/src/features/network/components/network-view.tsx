'use client';

import React, { useState } from 'react';
import { PERMISSIONS } from '@repo/shared';
import { useAuth } from '@/providers';
import { Icon } from '@/components/ui/Icon';
import { NetworkConsoleSkeleton } from '@/components/ui/PageSkeleton';
import { CustomerDetailModal } from '@/features/customers';
import { CreateTicketModal } from '@/features/tickets/components/create-ticket-modal';
import { useNetwork } from '../hooks/use-network';
import { NetworkStats } from './network-stats';
import { ClusterSelector } from './cluster-selector';
import { SplitterPortGrid } from './splitter-port-grid';
import { PortDetailPanel } from './port-detail-panel';
import { NetworkEntityModal, type NetworkEntityModalMode } from './network-entity-modal';
import '@/styles/features/network.css';

export function NetworkView() {
  const { hasPermission } = useAuth();
  const canManageNetwork = hasPermission(PERMISSIONS.NETWORK_UPDATE);
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [entityModalMode, setEntityModalMode] =
    useState<NetworkEntityModalMode>('CREATE_SPLITTER');

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
    historyLoading,
    auditRunning,
    auditResult,
    auditTimestamp,
    clusterOptions,
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
    handleCreateCluster,
    handleCreateSplitter,
    handleUpdateSplitter,
  } = useNetwork();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchClusters(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchClusters]);

  return (
    <main className="network-page-container" id="main-content">
      {/* Header Section matching Lintasarta FTTH Network Dashboard reference */}
      <header className="network-header-v2">
        <div className="network-header-titles">
          <h1 className="network-main-title">Master Jaringan & Splitter ODP</h1>
          <p className="network-sub-title">
            Data master jaringan FTTH, daftar ODP, splitter, dan informasi port secara terpusat.
          </p>
        </div>

        {canManageNetwork && (
          <div className="network-header-right">
            <div className="network-crud-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setEntityModalMode('CREATE_CLUSTER');
                  setEntityModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} />
                <span>Tambah Cluster</span>
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setEntityModalMode('CREATE_SPLITTER');
                  setEntityModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} />
                <span>Tambah ODP</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 3 Metric Cards Computed Directly from Live Network Matrix */}
      <NetworkStats networkStats={networkStats} />

      {/* Main Content Area: Master-Detail Console View OR Balanced 2x2 Grid View */}
      {loading ? (
        <NetworkConsoleSkeleton />
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
                      <span aria-hidden="true">·</span>
                      <span>
                        Koordinat: {activeSplitter.lat.toFixed(4)}, {activeSplitter.lng.toFixed(4)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Splitter: {activeSplitter.maxPorts === 8 ? '1x8 PLC' : '1x16 PLC'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="odp-header-right-stats">
                  <div className="odp-port-summary-clean">
                    <span>Total Port {activeSplitter.maxPorts}</span>
                    <span className="sep" aria-hidden="true">|</span>
                    <span>Terisi {activeSplitter.usedPorts}</span>
                    <span className="sep" aria-hidden="true">|</span>
                    <span>Siap PSB {activeSplitter.maxPorts - activeSplitter.usedPorts}</span>
                  </div>
                  {canManageNetwork && (
                    <button
                      type="button"
                      className="odp-more-menu-btn"
                      title="Edit kapasitas & status ODP"
                      aria-label={`Edit ODP ${activeSplitter.splitterCode}`}
                      onClick={() => {
                        setEntityModalMode('EDIT_SPLITTER');
                        setEntityModalOpen(true);
                      }}
                    >
                      ⋮
                    </button>
                  )}
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
                  historyLoading={historyLoading}
                  auditRunning={auditRunning}
                  auditResult={auditResult}
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
          onUpdated={() => {
            void fetchClusters(true);
          }}
        />
      )}

      {/* Integrated Ticket Dispatcher Modal */}
      <CreateTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        onSubmit={handleCreateTicketSubmit}
        initialValues={ticketModalInitial}
      />

      {/* Master Network CRUD Modal */}
      <NetworkEntityModal
        isOpen={entityModalOpen}
        mode={entityModalMode}
        clusters={
          clusterOptions.length > 0
            ? clusterOptions.map((c) => ({ clusterCode: c.clusterCode, name: c.name }))
            : clusterGroups.map((g) => ({
                clusterCode: g.clusterCode,
                name: g.name,
              }))
        }
        initialSplitter={
          activeSplitter
            ? {
                splitterCode: activeSplitter.splitterCode,
                clusterCode: activeSplitter.clusterCode,
                name: activeSplitter.name,
                maxPorts: activeSplitter.maxPorts,
                lat: activeSplitter.lat,
                lng: activeSplitter.lng,
                isActive: true,
              }
            : null
        }
        onClose={() => setEntityModalOpen(false)}
        onCreateCluster={handleCreateCluster}
        onCreateSplitter={handleCreateSplitter}
        onUpdateSplitter={handleUpdateSplitter}
      />
    </main>
  );
}
