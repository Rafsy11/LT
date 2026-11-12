'use client';

import React from 'react';
import { TicketDetailModal } from '@/features/tickets';
import { MonitoringSkeleton } from '@/components/ui/PageSkeleton';
import { useMonitoring } from '../hooks/use-monitoring';
import { MonitoringStats } from './monitoring-stats';
import { MonitoringIncidentBar } from './monitoring-incident-bar';
import { TelemetryStreamPanel } from './telemetry-stream-panel';
import { TelemetryInspectorHud } from './telemetry-inspector-hud';
import '@/styles/features/monitoring.css';

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

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchInitialReports(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchInitialReports]);

  if (loading && scopedReports.length === 0) {
    return <MonitoringSkeleton />;
  }

  return (
    <main className="monitoring-page" id="main-content">
      {/* Overview Command Header */}
      <header className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">NOC TELEMETRY &amp; ATTENUATION STREAM</div>
          <h1 className="overview-greeting">Live Monitoring Redaman</h1>
          <p className="overview-subtitle">
            Pusat kendali dan pemantauan sinyal redaman optik FTTH secara real-time via Server-Sent
            Events (SSE) &amp; Redis Pub/Sub (PRD Section 3.4).
          </p>
        </div>

        <nav className="overview-toolbar" role="toolbar" aria-label="Toolbar Live Monitoring">
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
            <span className="live-pulse-beacon" aria-hidden="true" />
            <span>
              {sseState === 'LIVE_CONNECTED' && 'Live SSE Active'}
              {sseState === 'CONNECTING' && 'Menghubungkan Stream...'}
              {sseState === 'RECONNECTING' && `Menghubungkan Ulang (${reconnectCountdown}s)...`}
              {sseState === 'DISCONNECTED' && 'Stream Terputus (Offline)'}
            </span>
          </div>


        </nav>
      </header>

      {/* 4 Telemetry Metrics Bar */}
      <MonitoringStats
        totalCount={scopedReports.length}
        normalCount={normalCount}
        warningCount={warningCount}
        criticalCount={criticalCount}
        activeTab={tab}
        onSelectTab={setTab}
      />

      {/* Authoritative NOC Critical Incident Response Strip */}
      <MonitoringIncidentBar
        pinnedCriticalReport={pinnedCriticalReport}
        onFocusReport={setSelectedTicket}
        onOpenModal={setModalTicket}
      />

      {/* Master-Detail Console Layout */}
      <section className="noc-console-layout" aria-label="Konsol Pemantauan Redaman Real-Time">
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
      </section>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={modalTicket}
        onClose={() => setModalTicket(null)}
        onTicketUpdated={() => fetchInitialReports(true)}
      />
    </main>
  );
}
