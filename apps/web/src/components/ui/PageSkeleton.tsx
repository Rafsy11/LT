'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Skeleton } from './Skeleton';

const DEFAULT_TABLE_ROWS = 4;
const DEFAULT_CUSTOMER_ROWS = 5;
const DEFAULT_STREAM_ROWS = 5;
const DEFAULT_CARD_COUNT = 6;
const DEFAULT_ODP_PORT_ROWS = 5;
const DEFAULT_CLUSTER_GROUPS = 4;
const SUBTLE_DIVIDER = '1px solid rgba(148, 163, 184, 0.2)';

/**
 * Universal Stat Card Skeleton.
 * Matches `.stat-card` anatomy (`.stat-card-top` with 36x36 icon + label-above-value + `.stat-card-footer`),
 * adapting automatically to `.monitoring-page` compact overrides.
 *
 * @example
 * <section className="overview-stats-grid">
 *   <StatCardSkeleton />
 * </section>
 */
export function StatCardSkeleton() {
  return (
    <article className="stat-card skeleton-card" aria-hidden="true">
      <div className="stat-card-inner">
        <div className="stat-card-top">
          <span className="stat-card-icon-round" aria-hidden="true">
            <Skeleton width={16} height={16} borderRadius={4} />
          </span>
          <div className="stat-card-text" style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-card-label" style={{ marginBottom: '6px' }}>
              <Skeleton width="62%" height={12} />
            </div>
            <div className="stat-card-value">
              <Skeleton width="38%" height={24} />
            </div>
          </div>
        </div>
        <div className="stat-card-footer">
          <Skeleton width="78%" height={12} />
        </div>
      </div>
    </article>
  );
}

/**
 * Shared Skeleton Card for Work Orders / Tickets.
 * Used by both `TicketsSkeleton` and `TicketGrid` inline loading states.
 *
 * @example
 * <section className="tickets-cards-grid">
 *   <TicketCardSkeleton />
 * </section>
 */
export function TicketCardSkeleton() {
  return (
    <article className="ticket-card skeleton-card" aria-hidden="true">
      <header className="ticket-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <Skeleton width={82} height={20} borderRadius={5} />
          <Skeleton width={74} height={18} borderRadius={4} />
        </div>
        <Skeleton width={72} height={18} borderRadius={4} />
      </header>

      <div className="ticket-card-body">
        <div className="ticket-customer-header">
          <Skeleton width="72%" height={17} style={{ marginBottom: '4px' }} />
          <div className="ticket-meta-row">
            <Skeleton width={96} height={16} borderRadius={4} />
            <Skeleton width={84} height={13} />
          </div>
        </div>

        <div className="ticket-spec-compact-strip">
          <div className="ticket-spec-compact-col" style={{ flex: 1 }}>
            <Skeleton width={56} height={10} style={{ marginBottom: '4px' }} />
            <Skeleton width="82%" height={14} />
          </div>
          <div className="ticket-spec-compact-col" style={{ alignItems: 'flex-end' }}>
            <Skeleton width={76} height={10} style={{ marginBottom: '4px' }} />
            <Skeleton width={68} height={16} borderRadius={4} />
          </div>
        </div>
      </div>

      <footer className="ticket-card-footer">
        <div className="ticket-tech-assigned">
          <Skeleton width={22} height={22} borderRadius="50%" style={{ flexShrink: 0 }} />
          <Skeleton width={96} height={13} />
        </div>
        <Skeleton width={52} height={13} />
      </footer>
    </article>
  );
}

/**
 * Shared Skeleton Card for Field Technicians & Mobile Session Cards.
 * Used by both `TechniciansSkeleton` and `TechnicianGrid` inline loading states.
 *
 * @example
 * <section className="technicians-cards-grid">
 *   <TechnicianCardSkeleton />
 * </section>
 */
export function TechnicianCardSkeleton() {
  return (
    <article className="technician-card skeleton-card" aria-hidden="true">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <Skeleton width={30} height={30} borderRadius="50%" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width="72%" height={15} style={{ marginBottom: '4px' }} />
            <Skeleton width="48%" height={11} />
          </div>
        </div>
        <Skeleton width={74} height={20} borderRadius={4} style={{ flexShrink: 0 }} />
      </header>

      <div className="tech-spec-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          <Skeleton width={72} height={16} borderRadius={3} />
          <Skeleton width={46} height={12} />
          <Skeleton width={58} height={12} />
        </div>
        <Skeleton width={72} height={17} borderRadius={3} style={{ flexShrink: 0 }} />
      </div>

      <footer className="tech-card-footer">
        <Skeleton width="100%" height={28} borderRadius={5} style={{ flex: 1 }} />
        <Skeleton width={28} height={28} borderRadius={5} style={{ flexShrink: 0 }} />
        <Skeleton width={28} height={28} borderRadius={5} style={{ flexShrink: 0 }} />
      </footer>
    </article>
  );
}

/**
 * Shared Skeleton Rows for Overview Ticket & Work Order 9-column Table.
 *
 * @example
 * <tbody><OverviewTableSkeletonRows count={4} /></tbody>
 */
export function OverviewTableSkeletonRows({ count = DEFAULT_TABLE_ROWS }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <tr key={idx} className="skeleton-row" aria-hidden="true">
          <td>
            <Skeleton width={78} height={14} />
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={125} height={14} />
              <Skeleton width={96} height={11} />
            </div>
          </td>
          <td>
            <Skeleton width={82} height={14} />
          </td>
          <td>
            <Skeleton width={94} height={22} borderRadius={9999} />
          </td>
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Skeleton width={24} height={24} borderRadius="50%" style={{ flexShrink: 0 }} />
              <Skeleton width={88} height={13} />
            </div>
          </td>
          <td>
            <Skeleton width={76} height={22} borderRadius={9999} />
          </td>
          <td>
            <Skeleton width={56} height={22} borderRadius={9999} />
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <Skeleton width={64} height={14} />
              <Skeleton width={46} height={11} />
            </div>
          </td>
          <td style={{ textAlign: 'right' }}>
            <Skeleton width={24} height={18} borderRadius={4} style={{ marginLeft: 'auto' }} />
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Shared Skeleton Rows for Live Telemetry Stream (`noc-stream-list`).
 *
 * @example
 * <ol className="noc-stream-list"><TelemetryStreamSkeletonRows count={5} /></ol>
 */
export function TelemetryStreamSkeletonRows({ count = DEFAULT_STREAM_ROWS }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <li
          key={idx}
          className="noc-stream-row skeleton-stream-row"
          aria-hidden="true"
          style={{ cursor: 'default' }}
        >
          <div className="col-time-status">
            <Skeleton width={7} height={7} borderRadius="50%" style={{ flexShrink: 0 }} />
            <Skeleton width={56} height={13} />
          </div>
          <div className="col-customer">
            <Skeleton width="78%" height={14} />
            <Skeleton width="58%" height={11} />
          </div>
          <div className="col-network">
            <Skeleton width="74%" height={14} />
            <Skeleton width="54%" height={11} />
          </div>
          <div className="col-tech">
            <Skeleton width={22} height={22} borderRadius="50%" style={{ flexShrink: 0 }} />
            <Skeleton width={68} height={13} />
          </div>
          <div className="col-signal">
            <Skeleton width={58} height={14} style={{ marginBottom: '4px' }} />
            <Skeleton width={76} height={4} borderRadius={2} />
          </div>
          <div className="col-validation">
            <Skeleton width={66} height={18} borderRadius={4} style={{ marginBottom: '3px' }} />
            <Skeleton width={56} height={11} />
          </div>
          <div className="col-action" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Skeleton width={52} height={24} borderRadius={4} />
          </div>
        </li>
      ))}
    </>
  );
}

/**
 * Shared Skeleton Rows for Customer SIA Master Data 7-column Table.
 *
 * @example
 * <tbody><CustomerTableSkeletonRows count={5} /></tbody>
 */
export function CustomerTableSkeletonRows({ count = DEFAULT_CUSTOMER_ROWS }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <tr key={idx} className="skeleton-row" aria-hidden="true">
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={132} height={15} />
              <Skeleton width={96} height={12} />
            </div>
          </td>
          <td style={{ maxWidth: '300px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={165} height={14} />
              <Skeleton width={140} height={11} />
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={98} height={14} />
              <Skeleton width={58} height={11} />
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={82} height={14} />
              <Skeleton width={54} height={11} />
            </div>
          </td>
          <td>
            <Skeleton width={74} height={22} borderRadius={4} />
          </td>
          <td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton width={86} height={14} />
              <Skeleton width={48} height={11} />
            </div>
          </td>
          <td style={{ textAlign: 'right' }}>
            <Skeleton width={78} height={28} borderRadius={6} style={{ marginLeft: 'auto' }} />
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Shared Master-Detail Console Skeleton for Network (`/network`).
 * Used by both `NetworkSkeleton` and inline loading inside `NetworkView`.
 *
 * @example
 * <NetworkConsoleSkeleton />
 */
export function NetworkConsoleSkeleton() {
  return (
    <div className="network-main-grid" aria-busy="true" aria-label="Memuat Konsol Splitter ODP">
      {/* Left Panel: Cluster & ODP Tree */}
      <aside className="tree-sidebar-card skeleton-card">
        <div className="tree-sidebar-header">
          <Skeleton width={120} height={16} />
        </div>
        <div className="tree-sidebar-search">
          <Skeleton width="100%" height={32} borderRadius={8} />
        </div>
        <div className="tree-clusters-accordion" style={{ gap: '8px' }}>
          {Array.from({ length: DEFAULT_CLUSTER_GROUPS }).map((_, idx) => (
            <div key={idx} className="tree-cluster-node">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
                <Skeleton width={120} height={15} />
                <Skeleton width={52} height={13} />
              </div>
              {idx < 2 && (
                <div className="tree-odp-branches-clean" style={{ gap: '6px', marginTop: '4px' }}>
                  <Skeleton width="100%" height={26} borderRadius={6} />
                  <Skeleton width="100%" height={26} borderRadius={6} />
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Right Column: Active ODP Command Deck & Port Table */}
      <section className="odp-main-panel-card skeleton-card">
        <header className="odp-hardware-chassis-top">
          <div className="odp-id-left-group" style={{ flex: 1, minWidth: 0 }}>
            <div className="odp-switch-icon-box" aria-hidden="true">
              <Skeleton width={20} height={20} borderRadius={4} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="odp-title-status-row" style={{ marginBottom: '6px' }}>
                <Skeleton width="min(100%, 220px)" height={20} />
                <Skeleton width={44} height={20} borderRadius={9999} />
              </div>
              <Skeleton width="min(100%, 280px)" height={13} />
            </div>
          </div>

          <div className="odp-header-right-stats">
            <Skeleton width={200} height={26} borderRadius={6} />
            <Skeleton width={28} height={28} borderRadius={6} />
          </div>
        </header>

        <nav className="odp-navigation-tabs-bar" aria-hidden="true" style={{ gap: '16px', paddingBottom: '10px' }}>
          <Skeleton width={118} height={18} />
          <Skeleton width={64} height={18} />
          <Skeleton width={62} height={18} />
          <Skeleton width={48} height={18} />
        </nav>

        <section className="odp-table-wrapper">
          <header className="odp-port-filter-bar" style={{ flexWrap: 'wrap' }}>
            <Skeleton width={64} height={13} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Skeleton width={108} height={26} borderRadius={6} />
              <Skeleton width={92} height={26} borderRadius={6} />
              <Skeleton width={92} height={26} borderRadius={6} />
            </div>
          </header>

          <div style={{ overflowX: 'auto' }}>
            <table className="odp-clean-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }} />
                  <th>PORT</th>
                  <th>ALOKASI</th>
                  <th>PELANGGAN / SIA</th>
                  <th>REDAMAN (dBm)</th>
                  <th>STATUS</th>
                  <th>AKTIVITAS TERAKHIR</th>
                  <th style={{ textAlign: 'right', paddingRight: '18px' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: DEFAULT_ODP_PORT_ROWS }).map((_, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="odp-table-data-row skeleton-row" aria-hidden="true">
                      <td>
                        <Skeleton width={12} height={12} borderRadius={3} />
                      </td>
                      <td>
                        <Skeleton width={34} height={16} />
                      </td>
                      <td>
                        <Skeleton width={70} height={14} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <Skeleton width={118} height={14} />
                          <Skeleton width={88} height={11} />
                        </div>
                      </td>
                      <td>
                        <Skeleton width={76} height={14} />
                      </td>
                      <td>
                        <Skeleton width={68} height={22} borderRadius={9999} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <Skeleton width={96} height={13} />
                          <Skeleton width={76} height={11} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '18px' }}>
                        <Skeleton width={64} height={20} style={{ marginLeft: 'auto' }} />
                      </td>
                    </tr>
                    {idx === 0 && (
                      <tr className="odp-table-expanded-row skeleton-row" aria-hidden="true">
                        <td colSpan={8} style={{ padding: '8px 16px 14px 16px' }}>
                          <Skeleton width="100%" height={86} borderRadius={8} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}

/**
 * Overview Dashboard Page Skeleton (`/`)
 *
 * @example
 * <OverviewSkeleton />
 */
export function OverviewSkeleton() {
  return (
    <main className="overview-page" aria-busy="true" aria-label="Memuat Overview">
      <header className="overview-header">
        <div className="overview-header-left">
          <div className="overview-datetime-header">
            <Skeleton width="min(100%, 215px)" height={24} />
            <Skeleton width={84} height={20} />
          </div>
          <Skeleton width={185} height={36} borderRadius={8} />
        </div>

        <div className="overview-header-right">
          <Skeleton width={162} height={38} borderRadius={8} />
        </div>
      </header>

      <section className="overview-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <section className="overview-middle-grid">
        <article className="panel overview-map-panel skeleton-card">
          <div className="panel-inner">
            <header className="panel-heading">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width={145} height={18} style={{ marginBottom: '6px' }} />
                <Skeleton width="min(100%, 220px)" height={13} />
              </div>
              <Skeleton width={92} height={14} />
            </header>
            <div className="clean-map-container" style={{ border: 'none' }}>
              <Skeleton width="100%" height="100%" borderRadius={10} />
            </div>
          </div>
        </article>

        <article className="panel overview-feed-panel skeleton-card">
          <div className="panel-inner">
            <header className="panel-heading">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Skeleton width={132} height={18} />
                <Skeleton width={48} height={18} borderRadius={9999} />
              </div>
              <Skeleton width={76} height={14} />
            </header>

            <ol className="feed-stream">
              {Array.from({ length: DEFAULT_TABLE_ROWS }).map((_, idx) => (
                <li className="feed-stream-item" key={idx}>
                  <Skeleton width={32} height={32} borderRadius="50%" style={{ flexShrink: 0 }} />
                  <div className="feed-stream-body">
                    <div className="feed-stream-top-row" style={{ marginBottom: '5px' }}>
                      <Skeleton width="66%" height={14} />
                      <Skeleton width={46} height={11} />
                    </div>
                    <Skeleton width="82%" height={12} style={{ marginBottom: '4px' }} />
                    <Skeleton width="58%" height={11} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </article>
      </section>

      <section className="panel overview-table-panel skeleton-card">
        <div className="panel-inner">
          <header className="panel-heading table-panel-header">
            <div className="table-header-left">
              <div className="table-title-row">
                <Skeleton width={160} height={20} />
                <Skeleton width={32} height={20} borderRadius={9999} />
              </div>
              <Skeleton width="min(100%, 245px)" height={13} style={{ marginTop: '6px' }} />
            </div>

            <div className="table-header-controls">
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Skeleton width={64} height={30} borderRadius={6} />
                <Skeleton width={78} height={30} borderRadius={6} />
                <Skeleton width={96} height={30} borderRadius={6} />
                <Skeleton width={64} height={30} borderRadius={6} />
              </div>
              <Skeleton width="min(100%, 210px)" height={32} borderRadius={6} />
              <Skeleton width={82} height={32} borderRadius={6} />
            </div>
          </header>

          <div className="table-scroll">
            <table className="lintasarta-table">
              <thead>
                <tr>
                  <th>NO. TIKET</th>
                  <th>PELANGGAN</th>
                  <th>TIPE PEKERJAAN</th>
                  <th>CLUSTER</th>
                  <th>TEKNISI</th>
                  <th>STATUS</th>
                  <th>PRIORITAS</th>
                  <th>REDAMAN</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <OverviewTableSkeletonRows count={DEFAULT_TABLE_ROWS} />
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Live Monitoring Page Skeleton (`/monitoring`)
 *
 * @example
 * <MonitoringSkeleton />
 */
export function MonitoringSkeleton() {
  return (
    <main className="monitoring-page" aria-busy="true" aria-label="Memuat Live Monitoring Redaman">
      <header className="overview-header">
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 230px)" height={12} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 290px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 480px)" height={16} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={148} height={30} borderRadius={9999} />
        </div>
      </header>

      <section className="monitoring-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <aside className="noc-incident-bar skeleton-card" aria-hidden="true">
        <div className="noc-incident-left">
          <Skeleton width={116} height={24} borderRadius={5} style={{ flexShrink: 0 }} />
          <Skeleton width="min(100%, 420px)" height={15} />
        </div>
        <div className="noc-incident-right" style={{ flexWrap: 'wrap' }}>
          <Skeleton width={68} height={18} />
          <Skeleton width={124} height={28} borderRadius={6} />
          <Skeleton width={96} height={28} borderRadius={6} />
        </div>
      </aside>

      <section className="noc-console-layout" aria-label="Memuat Konsol Pemantauan Redaman">
        <section className="noc-stream-panel skeleton-card">
          <header className="noc-stream-toolbar">
            <div className="noc-toolbar-top">
              <Skeleton width="min(100%, 300px)" height={30} borderRadius={6} />
              <div className="noc-filters-group">
                <Skeleton width={120} height={29} borderRadius={6} />
                <Skeleton width={148} height={29} borderRadius={6} />
                <Skeleton width={148} height={29} borderRadius={6} />
              </div>
            </div>
            <div className="noc-toolbar-bottom">
              <Skeleton width="min(100%, 360px)" height={30} borderRadius={6} />
              <Skeleton width={165} height={14} />
            </div>
          </header>

          <div className="noc-stream-scroll-wrap">
            <div className="noc-stream-table-header" aria-hidden="true">
              <Skeleton width={48} height={12} />
              <Skeleton width={110} height={12} />
              <Skeleton width={98} height={12} />
              <Skeleton width={64} height={12} />
              <Skeleton width={66} height={12} />
              <Skeleton width={62} height={12} />
              <Skeleton width={36} height={12} style={{ marginLeft: 'auto' }} />
            </div>

            <ol className="noc-stream-list">
              <TelemetryStreamSkeletonRows count={DEFAULT_STREAM_ROWS} />
            </ol>
          </div>

          <footer className="monitoring-info-strip">
            <Skeleton width="min(100%, 280px)" height={12} />
            <Skeleton width={175} height={12} />
          </footer>
        </section>

        <aside className="noc-inspector-panel skeleton-card">
          <header className="noc-inspector-header">
            <Skeleton width={132} height={12} />
            <Skeleton width={82} height={20} borderRadius={4} />
          </header>

          <div className="noc-inspector-body">
            <section className="hud-gauge-card">
              <div className="hud-gauge-top">
                <Skeleton width={96} height={28} />
                <Skeleton width={84} height={22} borderRadius={4} />
              </div>
              <Skeleton width="100%" height={5} borderRadius={3} style={{ margin: '10px 0 6px' }} />
              <div className="hud-spectrum-labels" style={{ marginBottom: '10px' }}>
                <Skeleton width={42} height={10} />
                <Skeleton width={32} height={10} />
                <Skeleton width={32} height={10} />
                <Skeleton width={42} height={10} />
              </div>
              <Skeleton width="95%" height={11} style={{ marginBottom: '4px' }} />
              <Skeleton width="72%" height={11} />
            </section>

            <section>
              <Skeleton width={160} height={12} style={{ marginBottom: '8px' }} />
              <div className="hud-spec-grid">
                <div className="hud-spec-item full-width">
                  <Skeleton width={92} height={11} style={{ marginBottom: '4px' }} />
                  <Skeleton width="68%" height={15} />
                </div>
                <div className="hud-spec-item">
                  <Skeleton width={68} height={11} style={{ marginBottom: '4px' }} />
                  <Skeleton width="78%" height={14} />
                </div>
                <div className="hud-spec-item">
                  <Skeleton width={72} height={11} style={{ marginBottom: '4px' }} />
                  <Skeleton width="72%" height={14} />
                </div>
                <div className="hud-spec-item">
                  <Skeleton width={88} height={11} style={{ marginBottom: '4px' }} />
                  <Skeleton width="64%" height={14} />
                </div>
                <div className="hud-spec-item">
                  <Skeleton width={70} height={11} style={{ marginBottom: '4px' }} />
                  <Skeleton width="52%" height={14} />
                </div>
              </div>
            </section>

            <section>
              <Skeleton width={196} height={12} style={{ marginBottom: '8px' }} />
              <div className="hud-security-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width="100%" height={14} />
                <Skeleton width="100%" height={14} />
                <Skeleton width="100%" height={14} />
                <Skeleton width="100%" height={14} />
              </div>
            </section>

            <div className="hud-actions">
              <Skeleton width="100%" height={36} borderRadius={6} />
              <Skeleton width="100%" height={36} borderRadius={6} />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

/**
 * Customers (SIA) Page Skeleton (`/customers`)
 *
 * @example
 * <CustomersSkeleton />
 */
export function CustomersSkeleton() {
  return (
    <main className="customers-page" aria-busy="true" aria-label="Memuat Pelanggan SIA">
      <header className="overview-header">
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 290px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 440px)" height={16} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={205} height={30} borderRadius={6} />
        </div>
      </header>

      <section className="customers-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <section className="panel skeleton-card" style={{ padding: '16px 20px 24px' }}>
        <nav className="customer-cluster-tab-bar" aria-hidden="true">
          <Skeleton width={118} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={120} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={124} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={118} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={116} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={88} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
          <Skeleton width={104} height={30} borderRadius={6} style={{ flexShrink: 0 }} />
        </nav>

        <div className="customer-sub-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Skeleton width="min(100%, 260px)" height={32} borderRadius={6} />
            <Skeleton width={126} height={31} borderRadius={6} />
          </div>
          <Skeleton width="min(100%, 350px)" height={31} borderRadius={6} />
        </div>

        <div className="table-scroll">
          <table className="lintasarta-table customer-table">
            <thead>
              <tr>
                <th>Pelanggan &amp; Nomor SIA</th>
                <th>Alamat Instalasi</th>
                <th>Cluster</th>
                <th>Splitter &amp; Port</th>
                <th>Status Layanan</th>
                <th>Redaman Terakhir</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <CustomerTableSkeletonRows count={DEFAULT_CUSTOMER_ROWS} />
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/**
 * Technicians & Sessions Page Skeleton (`/technicians`)
 *
 * @example
 * <TechniciansSkeleton />
 */
export function TechniciansSkeleton() {
  return (
    <main className="technicians-page" aria-busy="true" aria-label="Memuat Teknisi Lapangan">
      <header className="overview-header">
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 310px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 440px)" height={16} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={196} height={30} borderRadius={6} />
        </div>
      </header>

      <section className="technicians-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <section className="panel skeleton-card" style={{ padding: '16px 20px 24px' }}>
        <nav className="technician-sub-toolbar" aria-hidden="true">
          <Skeleton width="min(100%, 260px)" height={32} borderRadius={6} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Skeleton width={135} height={31} borderRadius={6} />
            <Skeleton width="min(100%, 420px)" height={31} borderRadius={6} />
          </div>
        </nav>

        <section className="technicians-cards-grid">
          {Array.from({ length: DEFAULT_CARD_COUNT }).map((_, i) => (
            <TechnicianCardSkeleton key={i} />
          ))}
        </section>
      </section>
    </main>
  );
}

/**
 * Tickets & Work Order Page Skeleton (`/tickets`)
 *
 * @example
 * <TicketsSkeleton />
 */
export function TicketsSkeleton() {
  return (
    <main className="tickets-page" aria-busy="true" aria-label="Memuat Tiket & Work Order">
      <header className="overview-header">
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 235px)" height={12} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 290px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 420px)" height={16} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={205} height={36} borderRadius={8} />
          <Skeleton width={138} height={36} borderRadius={8} />
        </div>
      </header>

      <section className="tickets-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <section className="tickets-toolbar">
        <div className="tickets-filter-group">
          <Skeleton width="min(100%, 380px)" height={35} borderRadius={8} />
          <Skeleton width={145} height={35} borderRadius={8} />
          <Skeleton width={182} height={35} borderRadius={8} />
        </div>
      </section>

      <div className="tickets-tabs-bar" aria-hidden="true">
        <Skeleton width={82} height={28} borderRadius={6} />
        <Skeleton width={104} height={28} borderRadius={6} />
        <Skeleton width={120} height={28} borderRadius={6} />
      </div>

      <section className="tickets-cards-grid">
        {Array.from({ length: DEFAULT_CARD_COUNT }).map((_, i) => (
          <TicketCardSkeleton key={i} />
        ))}
      </section>
    </main>
  );
}

/**
 * Network Master & Splitter ODP Page Skeleton (`/network`)
 *
 * @example
 * <NetworkSkeleton />
 */
export function NetworkSkeleton() {
  return (
    <main className="network-page-container" aria-busy="true" aria-label="Memuat Cluster Jaringan">
      <header className="network-header-v2">
        <div className="network-header-titles">
          <Skeleton width="min(100%, 290px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 440px)" height={16} />
        </div>
      </header>

      <section className="network-metrics-row-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <NetworkConsoleSkeleton />
    </main>
  );
}

/**
 * Roles & Access Control Page Skeleton (`/roles`)
 *
 * @example
 * <RolesSkeleton />
 */
export function RolesSkeleton() {
  return (
    <main className="roles-page" aria-busy="true" aria-label="Memuat Role & Access Control">
      <header className="overview-header">
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 275px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 435px)" height={16} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={196} height={30} borderRadius={6} />
        </div>
      </header>

      <section className="roles-stats-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      <section className="panel skeleton-card" style={{ padding: '20px 24px' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '20px',
            paddingBottom: '16px',
            borderBottom: SUBTLE_DIVIDER,
          }}
        >
          <div className="roles-tab-list" style={{ display: 'flex', gap: '10px' }}>
            <Skeleton width={195} height={32} borderRadius={6} style={{ flexShrink: 0 }} />
            <Skeleton width={178} height={32} borderRadius={6} style={{ flexShrink: 0 }} />
          </div>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <Skeleton width="min(100%, 260px)" height={32} borderRadius={6} />
          <Skeleton width={135} height={32} borderRadius={6} />
          <Skeleton width={135} height={32} borderRadius={6} />
        </div>

        <div className="table-scroll">
          <table className="lintasarta-table" style={{ width: '100%', minWidth: '680px' }}>
            <thead>
              <tr>
                <th>Pengguna</th>
                <th>Peran Sistem</th>
                <th>Cakupan Wilayah</th>
                <th>Status Akses</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: DEFAULT_CUSTOMER_ROWS }).map((_, idx) => (
                <tr key={idx} className="skeleton-row" aria-hidden="true">
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Skeleton width={34} height={34} borderRadius="50%" style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Skeleton width={126} height={14} />
                        <Skeleton width={168} height={11} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <Skeleton width={118} height={14} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <Skeleton width={142} height={14} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Skeleton width={38} height={20} borderRadius={10} />
                      <Skeleton width={40} height={12} />
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <Skeleton width={76} height={28} borderRadius={6} />
                      <Skeleton width={88} height={28} borderRadius={6} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer
          style={{
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <Skeleton width={180} height={13} />
          <Skeleton width="min(100%, 275px)" height={13} />
        </footer>
      </section>
    </main>
  );
}

/**
 * System Settings & Infrastructure Page Skeleton (`/settings`)
 *
 * @example
 * <SettingsSkeleton />
 */
export function SettingsSkeleton() {
  return (
    <main className="settings-page" aria-busy="true" aria-label="Memuat Pengaturan Sistem" style={{ paddingBottom: '48px', maxWidth: '1600px', margin: '0 auto' }}>
      <header className="overview-header" style={{ marginBottom: '22px' }}>
        <div className="overview-header-copy">
          <Skeleton width="min(100%, 275px)" height={12} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 310px)" height={30} style={{ marginBottom: '4px' }} />
          <Skeleton width="min(100%, 450px)" height={16} />
        </div>

        <div className="overview-toolbar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Skeleton width={168} height={30} borderRadius={6} />
          <Skeleton width={166} height={30} borderRadius={6} />
          <Skeleton width={112} height={30} borderRadius={6} />
        </div>
      </header>

      <nav
        className="settings-tab-list"
        aria-hidden="true"
        style={{
          gap: '20px',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: SUBTLE_DIVIDER,
        }}
      >
        <Skeleton width={188} height={18} style={{ flexShrink: 0 }} />
        <Skeleton width={205} height={18} style={{ flexShrink: 0 }} />
        <Skeleton width={212} height={18} style={{ flexShrink: 0 }} />
        <Skeleton width={196} height={18} style={{ flexShrink: 0 }} />
      </nav>

      <div className="settings-panel-grid">
        {/* Left Column: 2 Stacked Cards (AI Engine + Docker Compose) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <article className="settings-card skeleton-card">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width={195} height={18} style={{ marginBottom: '6px' }} />
                <Skeleton width="min(100%, 340px)" height={13} />
              </div>
              <Skeleton width={96} height={24} borderRadius={4} style={{ flexShrink: 0 }} />
            </header>

            <div className="settings-two-col-grid" style={{ marginBottom: '18px' }}>
              <Skeleton width="100%" height={78} borderRadius={6} />
              <Skeleton width="100%" height={78} borderRadius={6} />
            </div>

            <div className="settings-two-col-grid" style={{ marginBottom: '18px' }}>
              <Skeleton width="100%" height={56} borderRadius={6} />
              <Skeleton width="100%" height={56} borderRadius={6} />
            </div>

            <Skeleton width="100%" height={52} borderRadius={6} />
          </article>

          <article className="settings-card skeleton-card">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton width="min(100%, 260px)" height={18} style={{ marginBottom: '6px' }} />
                <Skeleton width="min(100%, 340px)" height={13} />
              </div>
              <Skeleton width={148} height={13} />
            </header>

            <div className="settings-two-col-grid">
              <Skeleton width="100%" height={86} borderRadius={6} />
              <Skeleton width="100%" height={86} borderRadius={6} />
              <Skeleton width="100%" height={86} borderRadius={6} />
              <Skeleton width="100%" height={86} borderRadius={6} />
            </div>
          </article>
        </div>

        {/* Right Column: Telemetry Server On-Premise */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <aside className="settings-card skeleton-card">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <Skeleton width={196} height={18} />
              <Skeleton width={132} height={22} borderRadius={4} />
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              {Array.from({ length: DEFAULT_TABLE_ROWS }).map((_, idx) => (
                <div key={idx} className="settings-gauge-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <Skeleton width={118} height={13} />
                    <Skeleton width={68} height={13} />
                  </div>
                  <Skeleton width={145} height={11} style={{ marginBottom: '8px' }} />
                  <Skeleton width="100%" height={6} borderRadius={9999} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '12px', borderTop: SUBTLE_DIVIDER }}>
              <Skeleton width="100%" height={13} />
              <Skeleton width="100%" height={13} />
              <Skeleton width="100%" height={13} />
            </div>
          </aside>
        </div>
      </div>

      <footer
        className="settings-save-footer skeleton-card"
        style={{
          marginTop: '24px',
          padding: '12px 18px',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <Skeleton width="min(100%, 340px)" height={14} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton width={68} height={32} borderRadius={6} />
          <Skeleton width={146} height={32} borderRadius={6} />
        </div>
      </footer>
    </main>
  );
}

/**
 * AI Assistant Page Skeleton (`/ai`)
 *
 * @example
 * <AiSkeleton />
 */
export function AiSkeleton() {
  return (
    <section
      className="ai-assistant-page"
      aria-busy="true"
      aria-label="Memuat AI Assistant"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 'calc(100vh - 125px)',
        width: '100%',
        padding: '36px 24px 32px 24px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          margin: 'auto 0',
          textAlign: 'center',
          width: '100%',
          maxWidth: '680px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Skeleton width={72} height={72} borderRadius={16} style={{ marginBottom: '20px' }} />
        <Skeleton width={210} height={34} style={{ marginBottom: '12px' }} />
        <Skeleton width="min(100%, 360px)" height={18} style={{ marginBottom: '40px' }} />
        <div className="ai-hero-cards-grid">
          <Skeleton width="100%" height={54} borderRadius={8} />
          <Skeleton width="100%" height={54} borderRadius={8} />
          <Skeleton width="100%" height={54} borderRadius={8} />
          <Skeleton width="100%" height={54} borderRadius={8} />
        </div>
      </div>

      <div className="ai-prompt-pill-bar skeleton-card" style={{ justifyContent: 'space-between' }}>
        <Skeleton width="min(100%, 240px)" height={18} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Skeleton width={34} height={34} borderRadius="50%" />
          <Skeleton width={42} height={42} borderRadius="50%" />
        </div>
      </div>
    </section>
  );
}

/**
 * Universal Dynamic Route Skeleton that automatically adapts based on pathname.
 *
 * @example
 * <DashboardRouteSkeleton routeOverride="/monitoring" />
 */
export function DashboardRouteSkeleton({ routeOverride }: { routeOverride?: string }) {
  const pathname = usePathname();
  const route = routeOverride || pathname || '/';

  if (route.startsWith('/tickets')) return <TicketsSkeleton />;
  if (route.startsWith('/customers')) return <CustomersSkeleton />;
  if (route.startsWith('/technicians')) return <TechniciansSkeleton />;
  if (route.startsWith('/monitoring')) return <MonitoringSkeleton />;
  if (route.startsWith('/network')) return <NetworkSkeleton />;
  if (route.startsWith('/roles')) return <RolesSkeleton />;
  if (route.startsWith('/settings')) return <SettingsSkeleton />;
  if (route.startsWith('/ai')) return <AiSkeleton />;

  return <OverviewSkeleton />;
}
