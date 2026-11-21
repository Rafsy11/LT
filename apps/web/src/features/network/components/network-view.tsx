'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ATTENUATION_THRESHOLDS,
  PERMISSIONS,
  STANDARD_ERROR_MESSAGES,
  STANDARD_ACTION_LABELS,
  STANDARD_EMPTY_STATES,
} from '@repo/shared';
import { useAuth } from '@/providers';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { NetworkConsoleSkeleton } from '@/components/ui/PageSkeleton';
import { CreateTicketModal } from '@/features/tickets/components/create-ticket-modal';
import { formatSplitterRatio, useNetwork } from '../hooks/use-network';
import { NetworkStats } from './network-stats';
import { ClusterSelector } from './cluster-selector';
import { SplitterPortGrid } from './splitter-port-grid';
import { PortDetailPanel } from './port-detail-panel';
import { NetworkEntityModal, type NetworkEntityModalMode } from './network-entity-modal';
import { DatekImportModal } from './datek-import-modal';
import '@/styles/features/network.css';

export function NetworkView() {
  const { hasPermission } = useAuth();
  const canManageNetwork = hasPermission(PERMISSIONS.NETWORK_UPDATE);
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [entityModalMode, setEntityModalMode] =
    useState<NetworkEntityModalMode>('CREATE_SPLITTER');
  const [importModalOpen, setImportModalOpen] = useState(false);

  const {
    search,
    setSearch,
    odpQuickFilter,
    setOdpQuickFilter,
    resetTreeFilters,
    clusterGroups,
    expandedClusters,
    toggleClusterExpand,
    networkData,
    loading,
    loadError,
    portFilter,
    setPortFilter,
    activeTab,
    setActiveTab,
    expandedPortNum,
    setExpandedPortNum,
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
    activeSplitterHealth,
    activeSplitterFilteredPorts,
    setActiveSplitterCode,
    getAttenuationMeta,
    odpHistoryLogs,
    handleCreateTicketSubmit,
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

  const goodLimitDb = ATTENUATION_THRESHOLDS.GOOD_MAX_LOSS_DB;

  const activeHealthBadge = (() => {
    if (!activeSplitterHealth) {
      return { label: 'Belum Diukur', cls: 'is-unmeasured' };
    }
    if (activeSplitterHealth.state === 'abnormal') {
      return {
        label: `Anomali (${activeSplitterHealth.badPortCount} port > ${goodLimitDb} dB)`,
        cls: 'is-abnormal',
      };
    }
    if (activeSplitterHealth.state === 'full') {
      return { label: 'Port Penuh', cls: 'is-full' };
    }
    if (activeSplitterHealth.state === 'normal') {
      return { label: `Normal (<= ${goodLimitDb} dB)`, cls: 'is-normal' };
    }
    return { label: 'Belum Diukur', cls: 'is-unmeasured' };
  })();

  const handleToggleAbnormalKpi = () => {
    setOdpQuickFilter((prev) => (prev === 'ABNORMAL' ? 'ALL' : 'ABNORMAL'));
  };

  return (
    <main className="network-page-container" id="main-content">
      {/* Page Header */}
      <header className="network-header-v2">
        <div className="network-header-titles">
          <h1 className="network-main-title">Master Jaringan &amp; Splitter ODP</h1>
          <p className="network-sub-title">
            Pengelolaan cluster FTTH, kapasitas port splitter, dan inspeksi redaman optik standar
            &le; {goodLimitDb} dB.
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
              <button
                type="button"
                className="button secondary"
                onClick={() => setImportModalOpen(true)}
              >
                <Icon name="upload" size={14} />
                <span>Import Datek</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 4 Operational KPI Cards */}
      <NetworkStats
        networkStats={networkStats}
        odpQuickFilter={odpQuickFilter}
        onToggleAbnormalFilter={handleToggleAbnormalKpi}
      />

      {/* Main Master-Detail Console */}
      {loading ? (
        <NetworkConsoleSkeleton />
      ) : loadError && networkData.length === 0 ? (
        <SafeErrorState
          error={loadError}
          title="Gagal Memuat Data Jaringan"
          description={STANDARD_ERROR_MESSAGES.DATA_LOAD_FAILED}
          onRetry={() => void fetchClusters(true)}
          retryLabel={STANDARD_ACTION_LABELS.RELOAD_DATA}
          variant="panel"
        />
      ) : networkData.length === 0 ? (
        <EmptyState
          icon="network"
          title={STANDARD_EMPTY_STATES.NETWORK.EMPTY_TITLE}
          description={STANDARD_EMPTY_STATES.NETWORK.EMPTY_DESC}
          actionLabel={canManageNetwork ? 'Tambah Cluster Pertama' : undefined}
          actionIcon="plus"
          onAction={
            canManageNetwork
              ? () => {
                  setEntityModalMode('CREATE_CLUSTER');
                  setEntityModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="network-main-grid">
          {/* Left Panel: Sticky Tree (Desktop) / Collapsible ODP Picker (Mobile) */}
          <ClusterSelector
            search={search}
            setSearch={setSearch}
            odpQuickFilter={odpQuickFilter}
            setOdpQuickFilter={setOdpQuickFilter}
            onResetFilters={resetTreeFilters}
            clusterGroups={clusterGroups}
            totalFilteredOdps={filteredClusters.length}
            abnormalOdpCount={networkStats.abnormalOdpCount}
            expandedClusters={expandedClusters}
            toggleClusterExpand={toggleClusterExpand}
            activeSplitter={activeSplitter}
            onSelectSplitter={setActiveSplitterCode}
          />

          {/* Right Column: Active ODP Command Deck */}
          {activeSplitter && (
            <section
              className="odp-main-panel-card"
              aria-label={`Detail ODP ${activeSplitter.splitterCode}`}
            >
              <header className="odp-hardware-chassis-top">
                <div className="odp-id-left-group">
                  <div className="odp-switch-icon-box" aria-hidden="true">
                    <Icon name="network" size={20} />
                  </div>
                  <div className="odp-identity-copy">
                    <div className="odp-title-status-row">
                      <h2 className="odp-name-heading">{activeSplitter.splitterCode}</h2>
                      <span className={`odp-health-badge ${activeHealthBadge.cls}`}>
                        {activeHealthBadge.label}
                      </span>
                    </div>
                    {activeSplitter.locationName && (
                      <div className="odp-location-line">{activeSplitter.locationName}</div>
                    )}
                    <p className="odp-sub-specs-line">
                      <span>
                        {activeSplitter.name} ({activeSplitter.clusterCode})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="odp-coord-mono">
                        {activeSplitter.lat.toFixed(5)}, {activeSplitter.lng.toFixed(5)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSplitterRatio(activeSplitter.maxPorts)}</span>
                    </p>
                  </div>
                </div>

                <div className="odp-header-right-stats">
                  <div className="odp-port-summary-clean" aria-label="Ringkasan kapasitas port">
                    <span>Total {activeSplitter.maxPorts}</span>
                    <span className="sep" aria-hidden="true">
                      |
                    </span>
                    <span>Terisi {activeSplitter.usedPorts}</span>
                    <span className="sep" aria-hidden="true">
                      |
                    </span>
                    <span>
                      Siap PSB {Math.max(0, activeSplitter.maxPorts - activeSplitter.usedPorts)}
                    </span>
                  </div>

                  <div className="odp-header-actions">
                    <Link
                      href={`/maps?odp=${encodeURIComponent(activeSplitter.splitterCode)}`}
                      className="odp-header-action-btn is-maps"
                      aria-label={`Lihat lokasi ${activeSplitter.splitterCode} di Peta Radar Maps`}
                    >
                      <Icon name="mapPin" size={13} />
                      <span>Lihat di Peta</span>
                    </Link>

                    {canManageNetwork && (
                      <button
                        type="button"
                        className="odp-header-action-btn"
                        aria-label={`Edit kapasitas dan koordinat ODP ${activeSplitter.splitterCode}`}
                        onClick={() => {
                          setEntityModalMode('EDIT_SPLITTER');
                          setEntityModalOpen(true);
                        }}
                      >
                        <Icon name="edit" size={13} />
                        <span>Edit ODP</span>
                      </button>
                    )}
                  </div>
                </div>
              </header>

              {/* Consolidated 3 Operational Tabs */}
              <nav className="odp-navigation-tabs-bar" role="tablist" aria-label="Tab navigasi ODP">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ports'}
                  className={`odp-nav-tab-btn ${activeTab === 'ports' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('ports')}
                >
                  Port &amp; Inspeksi
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
                  Audit Integritas
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
                  latestHistory={odpHistoryLogs[0] || null}
                  showSuccess={showSuccess}
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
                  onSelectAuditSplitter={(splitterCode, clusterCode) => {
                    setActiveSplitterCode(splitterCode, clusterCode);
                    setActiveTab('ports');
                  }}
                />
              )}
            </section>
          )}
        </div>
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

      {/* Palembang Datek Excel/CSV Import Modal */}
      <DatekImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          void fetchClusters(true);
        }}
      />
    </main>
  );
}
