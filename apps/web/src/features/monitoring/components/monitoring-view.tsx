'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { TicketDetailModal } from '@/features/tickets';
import { useMonitoring } from '../hooks/use-monitoring';
import { MonitoringStats } from './monitoring-stats';
import { MonitoringIncidentBar } from './monitoring-incident-bar';
import { TelemetryStreamPanel } from './telemetry-stream-panel';
import { TelemetryInspectorHud } from './telemetry-inspector-hud';

export function MonitoringView() {
  const {
    tab,
    setTab,
    search,
    setSearch,
    cluster,
    setCluster,
    typeFilter,
    setTypeFilter,
    techFilter,
    setTechFilter,
    loading,
    setSelectedTicket,
    modalTicket,
    setModalTicket,
    sseState,
    reconnectCountdown,
    lastHeartbeat,
    availableTechs,
    scopedReports,
    filteredReports,
    normalCount,
    warningCount,
    criticalCount,
    pinnedCriticalReport,
    activeReport,
    getMeterPercentage,
    formatTimestamp,
    fetchInitialReports,
  } = useMonitoring();

  return (
    <main className="monitoring-page">
      {/* Overview Command Header */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">NOC TELEMETRY & ATTENUATION STREAM</div>
          <h1 className="overview-greeting">Live Monitoring Redaman</h1>
          <p className="overview-subtitle">
            Pusat kendali dan pemantauan sinyal redaman optik FTTH secara real-time via Server-Sent
            Events (SSE) &amp; Redis Pub/Sub (PRD Section 3.4).
          </p>
        </div>

        <div className="overview-toolbar">
          {/* Live SSE Status Beacon */}
          <div
            className={`live-status-pill ${
              sseState === 'LIVE_CONNECTED'
                ? 'connected'
                : sseState === 'CONNECTING'
                  ? 'reconnecting'
                  : 'disconnected'
            }`}
            title={`Status SSE: ${sseState} · Heartbeat: ${lastHeartbeat}`}
          >
            <span className="live-pulse-beacon" />
            <span>
              {sseState === 'LIVE_CONNECTED' && 'Live SSE Active'}
              {sseState === 'CONNECTING' && 'Menghubungkan Stream...'}
              {sseState === 'RECONNECTING' && `Menghubungkan Ulang (${reconnectCountdown}s)...`}
              {sseState === 'DISCONNECTED' && 'Stream Terputus (Offline)'}
            </span>
          </div>

          <button
            className="refresh-btn"
            onClick={fetchInitialReports}
            type="button"
            aria-label="Segarkan feed laporan"
            title="Segarkan feed laporan"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metrics Bar */}
      <MonitoringStats
        totalCount={scopedReports.length}
        normalCount={normalCount}
        warningCount={warningCount}
        criticalCount={criticalCount}
        onSelectTab={setTab}
      />

      {/* Authoritative NOC Critical Incident Response Strip */}
      <MonitoringIncidentBar
        pinnedCriticalReport={pinnedCriticalReport}
        onFocusReport={setSelectedTicket}
        onOpenModal={setModalTicket}
      />

      {/* Master-Detail Console Layout */}
      <div className="noc-console-layout">
        <TelemetryStreamPanel
          search={search}
          setSearch={setSearch}
          cluster={cluster}
          setCluster={setCluster}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          techFilter={techFilter}
          setTechFilter={setTechFilter}
          availableTechs={availableTechs}
          tab={tab}
          setTab={setTab}
          scopedReportsCount={scopedReports.length}
          normalCount={normalCount}
          warningCount={warningCount}
          criticalCount={criticalCount}
          filteredReports={filteredReports}
          loading={loading}
          activeReport={activeReport}
          onSelectReport={setSelectedTicket}
          getMeterPercentage={getMeterPercentage}
          formatTimestamp={formatTimestamp}
          lastHeartbeat={lastHeartbeat}
        />

        <TelemetryInspectorHud
          activeReport={activeReport}
          getMeterPercentage={getMeterPercentage}
          onOpenModal={setModalTicket}
        />
      </div>

      {/* Ticket Detail Modal */}
      <TicketDetailModal ticket={modalTicket} onClose={() => setModalTicket(null)} />
    </main>
  );
}
