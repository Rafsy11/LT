'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MonitoringSkeleton } from '@/components/ui/PageSkeleton';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { TicketDetailModal } from '@/features/tickets';
import { useMonitoring, type LiveReportItem } from '../hooks/use-monitoring';
import { MonitoringIncidentBar } from './monitoring-incident-bar';
import { MonitoringStats } from './monitoring-stats';
import { TelemetryInspectorHud } from './telemetry-inspector-hud';
import { TelemetryStreamPanel } from './telemetry-stream-panel';
import '@/styles/features/monitoring.css';

const COMPACT_INSPECTOR_MEDIA_QUERY = '(max-width: 1279px)';

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
    reports,
    loading,
    isRefreshing,
    loadError,
    setSelectedTicket,
    modalTicket,
    setModalTicket,
    sseState,
    reconnectCountdown,
    lastHeartbeat,
    autoFollowLive,
    setAutoFollowLive,
    pendingLiveUpdates,
    jumpToLatestLiveReport,
    reconnectStream,
    availableTechs,
    scopedReports,
    filteredReports,
    normalCount,
    warningCount,
    criticalCount,
    unmeasuredCount,
    measuredCount,
    criticalReports,
    activeCriticalIndex,
    cycleCriticalReport,
    activeReport,
    getMeterPercentage,
    formatTimestamp,
    fetchInitialReports,
  } = useMonitoring();

  const inspectorDialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    function handleGlobalRefresh() {
      void fetchInitialReports(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchInitialReports]);

  // Configure native closedby="any" + Safari backdrop light-dismiss fallback on <dialog>
  useEffect(() => {
    const dialog = inspectorDialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', 'any');

    if ('closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    let pressedOutside = false;
    const isOutsideDialog = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutsideDialog(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutsideDialog(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  // Automatically close the mobile dialog if viewport expands to desktop split-view
  useEffect(() => {
    const mql = window.matchMedia(COMPACT_INSPECTOR_MEDIA_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      const dialog = inspectorDialogRef.current;
      if (!event.matches && dialog?.open) {
        dialog.close();
      }
    };
    mql.addEventListener('change', handleViewportChange);
    return () => mql.removeEventListener('change', handleViewportChange);
  }, []);

  const closeInspectorDialog = useCallback(() => {
    const dialog = inspectorDialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
  }, []);

  const handleSelectReport = useCallback(
    (report: LiveReportItem) => {
      setSelectedTicket(report);
      if (window.matchMedia(COMPACT_INSPECTOR_MEDIA_QUERY).matches) {
        const dialog = inspectorDialogRef.current;
        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }
    },
    [setSelectedTicket],
  );

  const handleJumpToLatest = useCallback(() => {
    const target = jumpToLatestLiveReport();
    if (target && window.matchMedia(COMPACT_INSPECTOR_MEDIA_QUERY).matches) {
      const dialog = inspectorDialogRef.current;
      if (dialog && !dialog.open) {
        dialog.showModal();
      }
    }
  }, [jumpToLatestLiveReport]);

  const handleOpenModalFromInspector = useCallback(
    (report: LiveReportItem) => {
      closeInspectorDialog();
      setModalTicket(report);
    },
    [closeInspectorDialog, setModalTicket],
  );

  const handleHeaderRefresh = useCallback(() => {
    if (sseState === 'DISCONNECTED' || sseState === 'RECONNECTING') {
      reconnectStream();
      return;
    }
    void fetchInitialReports(true);
  }, [sseState, reconnectStream, fetchInitialReports]);

  if (loading && reports.length === 0) {
    return <MonitoringSkeleton />;
  }

  if (loadError && reports.length === 0) {
    return (
      <main className="monitoring-page" id="main-content">
        <SafeErrorState
          error={loadError}
          title="Data Pantauan Redaman Belum Dapat Dimuat"
          onRetry={() => void fetchInitialReports(true)}
          retryLabel="Muat Ulang Data"
        />
      </main>
    );
  }

  const sseStatusClass =
    sseState === 'LIVE_CONNECTED'
      ? 'connected'
      : sseState === 'CONNECTING' || sseState === 'RECONNECTING'
        ? 'reconnecting'
        : 'disconnected';

  const sseStatusLabel =
    sseState === 'LIVE_CONNECTED'
      ? 'Tersambung'
      : sseState === 'CONNECTING'
        ? 'Menyambungkan...'
        : sseState === 'RECONNECTING'
          ? `Menyambung ulang (${reconnectCountdown}d)...`
          : 'Terputus';

  const needsReconnect = sseState === 'DISCONNECTED' || sseState === 'RECONNECTING';

  return (
    <main className="monitoring-page" id="main-content">
      {/* Operational Header */}
      <header className="overview-header monitoring-header">
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Pantauan Redaman Langsung</h1>
          <p className="overview-subtitle">
            Aliran pengukuran redaman optik (OPM) dan status validasi laporan lapangan secara
            real-time.
          </p>
        </div>

        <div className="overview-toolbar monitoring-toolbar" role="toolbar" aria-label="Kontrol Pantauan">
          <div
            className={`live-status-pill ${sseStatusClass}`}
            role="status"
            aria-live="polite"
            title={`Sinkronisasi terakhir: ${lastHeartbeat}`}
          >
            <span className="live-pulse-beacon" aria-hidden="true" />
            <span>{sseStatusLabel}</span>
          </div>

          <button
            type="button"
            className={`monitoring-refresh-btn ${needsReconnect ? 'monitoring-refresh-btn--reconnect' : ''}`}
            onClick={handleHeaderRefresh}
            disabled={isRefreshing}
          >
            <Icon name="refresh" size={14} />
            <span>
              {isRefreshing
                ? 'Memuat...'
                : needsReconnect
                  ? 'Hubungkan Ulang'
                  : 'Muat Ulang'}
            </span>
          </button>
        </div>
      </header>

      {Boolean(loadError) && reports.length > 0 && (
        <div className="monitoring-inline-error" role="alert">
          <span>Gagal menyegarkan data terbaru. Menampilkan data terakhir yang tersimpan.</span>
          <button
            type="button"
            className="monitoring-inline-error-btn"
            onClick={() => void fetchInitialReports(true)}
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* 4 Telemetry Metrics Bar */}
      <MonitoringStats
        totalCount={scopedReports.length}
        measuredCount={measuredCount}
        unmeasuredCount={unmeasuredCount}
        normalCount={normalCount}
        warningCount={warningCount}
        criticalCount={criticalCount}
        activeTab={tab}
        onSelectTab={setTab}
      />

      {/* Critical Incident Response Strip */}
      <MonitoringIncidentBar
        criticalReports={criticalReports}
        activeCriticalIndex={activeCriticalIndex}
        onCycleCritical={cycleCriticalReport}
        onFocusReport={handleSelectReport}
        onOpenModal={setModalTicket}
      />

      {/* Master-Detail Console Layout */}
      <section className="noc-console-layout" aria-label="Konsol Pemantauan Redaman">
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
          unmeasuredCount={unmeasuredCount}
          filteredReports={filteredReports}
          loading={loading}
          activeReport={activeReport}
          onSelectReport={handleSelectReport}
          getMeterPercentage={getMeterPercentage}
          formatTimestamp={formatTimestamp}
          sseState={sseState}
          reconnectCountdown={reconnectCountdown}
          lastHeartbeat={lastHeartbeat}
          autoFollowLive={autoFollowLive}
          setAutoFollowLive={setAutoFollowLive}
          pendingLiveUpdates={pendingLiveUpdates}
          onJumpToLatest={handleJumpToLatest}
        />

        {/* Desktop Split-Pane Inspector (hidden via CSS < 1280px where native <dialog> takes over) */}
        <div className="noc-inspector-desktop-slot">
          <TelemetryInspectorHud
            activeReport={activeReport}
            getMeterPercentage={getMeterPercentage}
            onOpenModal={setModalTicket}
            titleId="noc-inspector-desktop-title"
          />
        </div>
      </section>

      {/* Native <dialog> Modal Inspector Sheet for Tablet & Mobile (< 1280px) */}
      <dialog
        ref={inspectorDialogRef}
        className="noc-inspector-dialog"
        aria-labelledby="noc-inspector-dialog-title"
      >
        <TelemetryInspectorHud
          activeReport={activeReport}
          getMeterPercentage={getMeterPercentage}
          onOpenModal={handleOpenModalFromInspector}
          inDialog
          titleId="noc-inspector-dialog-title"
          onCloseDialog={closeInspectorDialog}
        />
      </dialog>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={modalTicket}
        onClose={() => setModalTicket(null)}
        onTicketUpdated={() => void fetchInitialReports(true)}
      />
    </main>
  );
}
