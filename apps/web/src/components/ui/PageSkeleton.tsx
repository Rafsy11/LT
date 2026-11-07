'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Skeleton } from './Skeleton';

/**
 * Universal Stat Card Macro-Skeleton
 * Represents the 4-column KPI telemetry metrics row across all dashboard views.
 */
export function StatCardSkeleton() {
  return (
    <article className="stat-card skeleton-card" style={{ padding: '16px 18px', minHeight: '84px', display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%' }}>
        <Skeleton width={42} height={42} borderRadius={10} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton width="48%" height={22} style={{ marginBottom: '6px' }} />
          <Skeleton width="75%" height={12} />
        </div>
      </div>
    </article>
  );
}

/**
 * Overview Macro-Skeleton
 * Geometry: Header -> Cluster Pill -> 4 KPIs -> 2-Column Mid-Tier -> Tickets Table
 */
export function OverviewSkeleton() {
  return (
    <main className="overview-container" aria-busy="true" aria-label="Memuat Overview" style={{ paddingBottom: '32px' }}>
      {/* Header */}
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={260} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={320} height={14} />
        </div>
        <div className="overview-toolbar">
          <Skeleton width={140} height={36} borderRadius={6} />
        </div>
      </header>

      {/* Cluster Filter Pill */}
      <div style={{ marginBottom: '20px' }}>
        <Skeleton width={150} height={32} borderRadius={6} />
      </div>

      {/* 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '24px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* Two-Column Mid-Tier: Network Map & Recent Activity */}
      <div className="overview-grid" style={{ marginBottom: '24px' }}>
        <article className="panel skeleton-card" style={{ height: '360px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <Skeleton width={180} height={18} />
            <Skeleton width={90} height={14} />
          </div>
          <Skeleton width="100%" height={270} borderRadius={8} />
        </article>

        <article className="panel skeleton-card" style={{ height: '360px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <Skeleton width={140} height={18} />
            <Skeleton width={80} height={14} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Skeleton width="100%" height={50} borderRadius={6} />
            <Skeleton width="100%" height={50} borderRadius={6} />
            <Skeleton width="100%" height={50} borderRadius={6} />
            <Skeleton width="100%" height={50} borderRadius={6} />
          </div>
        </article>
      </div>

      {/* Bottom Panel: Tickets Table Macro Slab */}
      <section className="panel skeleton-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <Skeleton width={200} height={20} style={{ marginBottom: '6px' }} />
            <Skeleton width={260} height={13} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={200} height={32} borderRadius={6} />
            <Skeleton width={90} height={32} borderRadius={6} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Skeleton width="100%" height={38} borderRadius={4} />
          <Skeleton width="100%" height={46} borderRadius={4} />
          <Skeleton width="100%" height={46} borderRadius={4} />
          <Skeleton width="100%" height={46} borderRadius={4} />
        </div>
      </section>
    </main>
  );
}

/**
 * Live Monitoring Macro-Skeleton
 * Geometry: Header + Live Beacon -> 4 KPIs -> Incident Bar -> Multi-Select Toolbar -> Full-Width Table -> Bottom HUD
 * 100% Geometry Parity with real /monitoring screen!
 */
export function MonitoringSkeleton() {
  return (
    <main className="monitoring-page" aria-busy="true" aria-label="Memuat Live Monitoring Redaman" style={{ paddingBottom: '32px' }}>
      {/* 1. Header with Eyebrow, Title, Subtitle, and Live Beacon */}
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={240} height={12} style={{ marginBottom: '8px' }} />
          <Skeleton width={280} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={480} height={14} />
        </div>
        <Skeleton width={130} height={32} borderRadius={9999} />
      </header>

      {/* 2. 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '20px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* 3. Incident Alert Bar Macro Strip */}
      <aside className="stat-card skeleton-card" style={{ height: '46px', padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <Skeleton width={18} height={18} borderRadius="50%" />
          <Skeleton width="55%" height={16} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Skeleton width={70} height={16} />
          <Skeleton width={100} height={28} borderRadius={6} />
        </div>
      </aside>

      {/* 4. Filter & Toolbar Macro Strip */}
      <div className="stat-card skeleton-card" style={{ height: '52px', padding: '10px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Skeleton width={280} height={32} borderRadius={6} />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Skeleton width={130} height={32} borderRadius={6} />
          <Skeleton width={150} height={32} borderRadius={6} />
          <Skeleton width={150} height={32} borderRadius={6} />
        </div>
      </div>

      {/* 5. Main Telemetry Stream Table Macro Panel */}
      <section className="noc-stream-panel skeleton-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
          <Skeleton width={60} height={13} />
          <Skeleton width={140} height={13} />
          <Skeleton width={120} height={13} />
          <Skeleton width={90} height={13} />
          <Skeleton width={70} height={13} />
          <Skeleton width={70} height={13} />
          <Skeleton width={50} height={13} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Skeleton width="100%" height={40} borderRadius={6} />
          <Skeleton width="100%" height={40} borderRadius={6} />
          <Skeleton width="100%" height={40} borderRadius={6} />
          <Skeleton width="100%" height={40} borderRadius={6} />
        </div>
      </section>

      {/* 6. Telemetry Inspector HUD Bottom Macro Panel */}
      <section className="noc-inspector-panel skeleton-card" style={{ padding: '20px', minHeight: '170px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Skeleton width={180} height={20} />
          <Skeleton width={90} height={24} borderRadius={4} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <Skeleton width="100%" height={70} borderRadius={6} />
          <Skeleton width="100%" height={70} borderRadius={6} />
          <Skeleton width="100%" height={70} borderRadius={6} />
        </div>
      </section>
    </main>
  );
}

/**
 * Customers (SIA) Macro-Skeleton
 * Geometry: Header -> 4 KPIs -> Cluster Filter Tabs + Search Toolbar -> Master Table Surface
 */
export function CustomersSkeleton() {
  return (
    <main className="customers-page" aria-busy="true" aria-label="Memuat Pelanggan SIA" style={{ paddingBottom: '32px' }}>
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={280} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={380} height={14} />
        </div>
        <Skeleton width={140} height={32} borderRadius={9999} />
      </header>

      {/* 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '24px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* Main Panel Container */}
      <section className="panel skeleton-card" style={{ padding: '18px 20px 24px' }}>
        {/* Cluster Tabs Toolbar Strip */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', paddingBottom: '12px' }}>
          <Skeleton width={110} height={32} borderRadius={6} />
          <Skeleton width={120} height={32} borderRadius={6} />
          <Skeleton width={120} height={32} borderRadius={6} />
          <Skeleton width={120} height={32} borderRadius={6} />
        </div>

        {/* Search + Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={280} height={34} borderRadius={6} />
            <Skeleton width={130} height={34} borderRadius={6} />
          </div>
          <Skeleton width={320} height={34} borderRadius={6} />
        </div>

        {/* Master Table Surface */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Skeleton width="100%" height={38} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
        </div>
      </section>
    </main>
  );
}

/**
 * Technicians Macro-Skeleton
 * Geometry: Header + Redis Status -> 4 KPIs -> Filter Toolbar -> 6 Macro Cards Grid
 */
export function TechniciansSkeleton() {
  return (
    <main className="technicians-page" aria-busy="true" aria-label="Memuat Teknisi Lapangan" style={{ paddingBottom: '32px' }}>
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={260} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={360} height={14} />
        </div>
        <Skeleton width={150} height={32} borderRadius={9999} />
      </header>

      {/* 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '24px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* Filter Toolbar Panel */}
      <section className="panel skeleton-card" style={{ padding: '18px 20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <Skeleton width={280} height={34} borderRadius={6} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={140} height={34} borderRadius={6} />
            <Skeleton width={260} height={34} borderRadius={6} />
          </div>
        </div>

        {/* 6 Technician Macro Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <article key={i} className="technician-card skeleton-card" style={{ padding: '18px', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Skeleton width={42} height={42} borderRadius="50%" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Skeleton width="65%" height={16} style={{ marginBottom: '6px' }} />
                  <Skeleton width="45%" height={12} />
                </div>
              </div>
              <Skeleton width="100%" height={36} borderRadius={6} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Skeleton width={80} height={14} />
                <Skeleton width={60} height={14} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

/**
 * Tickets Macro-Skeleton
 * Geometry: Header -> 4 KPIs -> Segmented Tabs & Action Toolbar -> 6 Work Order Cards Grid
 */
export function TicketsSkeleton() {
  return (
    <main className="tickets-page" aria-busy="true" aria-label="Memuat Tiket & Work Order" style={{ paddingBottom: '32px' }}>
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={240} height={12} style={{ marginBottom: '8px' }} />
          <Skeleton width={260} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={380} height={14} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton width={140} height={36} borderRadius={6} />
          <Skeleton width={130} height={36} borderRadius={6} />
        </div>
      </header>

      {/* 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '24px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* Toolbar: Segmented tabs & search */}
      <section className="panel skeleton-card" style={{ padding: '16px 20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <Skeleton width={280} height={36} borderRadius={8} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={200} height={36} borderRadius={6} />
            <Skeleton width={180} height={36} borderRadius={6} />
          </div>
        </div>

        {/* 6 Work Order Macro Cards */}
        <div className="tickets-cards-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <article key={i} className="ticket-card skeleton-card" style={{ padding: '16px', minHeight: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Skeleton width={100} height={20} borderRadius={10} />
                <Skeleton width={70} height={20} borderRadius={10} />
              </div>
              <Skeleton width="80%" height={17} style={{ marginBottom: '6px' }} />
              <Skeleton width="50%" height={13} style={{ marginBottom: '12px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}>
                <Skeleton width={90} height={13} />
                <Skeleton width={80} height={13} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

/**
 * Network (Master Jaringan & Splitter ODP) Macro-Skeleton
 * Geometry: Header -> 3 Network Stats -> Master-Detail Splitter Grid (Left Selector + Right ODP Deck)
 */
export function NetworkSkeleton() {
  return (
    <main className="network-page-container" aria-busy="true" aria-label="Memuat Cluster Jaringan" style={{ paddingBottom: '32px' }}>
      <header className="network-header-v2" style={{ marginBottom: '24px' }}>
        <div className="network-header-titles">
          <Skeleton width={280} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={420} height={14} />
        </div>
      </header>

      {/* 3 Network Stats Cards */}
      <section className="network-stats-grid" style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* 2-Column Splitter Console */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: '20px' }}>
        {/* Left: Cluster Selector Tree Slab */}
        <aside className="panel skeleton-card" style={{ height: '500px', padding: '16px' }}>
          <Skeleton width={140} height={18} style={{ marginBottom: '14px' }} />
          <Skeleton width="100%" height={32} borderRadius={6} style={{ marginBottom: '14px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton width="100%" height={44} borderRadius={6} />
            <Skeleton width="100%" height={44} borderRadius={6} />
            <Skeleton width="100%" height={44} borderRadius={6} />
            <Skeleton width="100%" height={44} borderRadius={6} />
            <Skeleton width="100%" height={44} borderRadius={6} />
          </div>
        </aside>

        {/* Right: Active ODP Command Deck Slab */}
        <section className="odp-main-panel-card skeleton-card" style={{ height: '500px', padding: '20px' }}>
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

          {/* 16-Port Grid Silhouette */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={60} borderRadius={6} />
            ))}
          </div>

          {/* Inspection Sub-Panel Slab */}
          <Skeleton width="100%" height={180} borderRadius={8} />
        </section>
      </div>
    </main>
  );
}

/**
 * Roles & Access Control Macro-Skeleton
 * Geometry: Header -> 4 KPIs -> Panel (Tab Switcher + Filter Toolbar + Table Surface)
 */
export function RolesSkeleton() {
  return (
    <main className="roles-page" aria-busy="true" aria-label="Memuat Role & Access Control" style={{ paddingBottom: '32px' }}>
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={270} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={380} height={14} />
        </div>
        <Skeleton width={150} height={32} borderRadius={9999} />
      </header>

      {/* 4 Metric Cards */}
      <section className="stats-row" style={{ marginBottom: '24px' }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>

      {/* Panel */}
      <section className="panel skeleton-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '1px solid rgba(148, 163, 184, 0.15)', paddingBottom: '14px' }}>
          <Skeleton width={190} height={34} borderRadius={6} />
          <Skeleton width={190} height={34} borderRadius={6} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <Skeleton width={280} height={34} borderRadius={6} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width={140} height={34} borderRadius={6} />
            <Skeleton width={140} height={34} borderRadius={6} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Skeleton width="100%" height={38} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
          <Skeleton width="100%" height={48} borderRadius={4} />
        </div>
      </section>
    </main>
  );
}

/**
 * Settings Macro-Skeleton
 * Geometry: Header -> 4 Category Tabs -> 2-Column Bento Slabs
 */
export function SettingsSkeleton() {
  return (
    <main className="settings-page" aria-busy="true" aria-label="Memuat Pengaturan Sistem" style={{ paddingBottom: '32px' }}>
      <header className="overview-header" style={{ marginBottom: '24px' }}>
        <div className="overview-header-copy">
          <Skeleton width={260} height={28} style={{ marginBottom: '8px' }} />
          <Skeleton width={380} height={14} />
        </div>
        <Skeleton width={130} height={32} borderRadius={9999} />
      </header>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Skeleton width={160} height={36} borderRadius={6} />
        <Skeleton width={160} height={36} borderRadius={6} />
        <Skeleton width={160} height={36} borderRadius={6} />
        <Skeleton width={160} height={36} borderRadius={6} />
      </div>

      {/* Configuration Bento Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        <section className="panel skeleton-card" style={{ height: '480px', padding: '24px' }}>
          <Skeleton width={220} height={20} style={{ marginBottom: '8px' }} />
          <Skeleton width={320} height={13} style={{ marginBottom: '20px' }} />
          <Skeleton width="100%" height={120} borderRadius={8} style={{ marginBottom: '16px' }} />
          <Skeleton width="100%" height={180} borderRadius={8} />
        </section>

        <section className="panel skeleton-card" style={{ height: '480px', padding: '24px' }}>
          <Skeleton width={220} height={20} style={{ marginBottom: '8px' }} />
          <Skeleton width={320} height={13} style={{ marginBottom: '20px' }} />
          <Skeleton width="100%" height={120} borderRadius={8} style={{ marginBottom: '16px' }} />
          <Skeleton width="100%" height={180} borderRadius={8} />
        </section>
      </div>
    </main>
  );
}

/**
 * AI Assistant Macro-Skeleton
 */
export function AiSkeleton() {
  return (
    <main className="ai-page" aria-busy="true" aria-label="Memuat AI Assistant" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <Skeleton width={76} height={76} borderRadius="50%" style={{ marginBottom: '20px' }} />
      <Skeleton width={220} height={28} style={{ marginBottom: '10px' }} />
      <Skeleton width={360} height={16} style={{ marginBottom: '32px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 260px)', gap: '12px', marginBottom: '40px' }}>
        <Skeleton width={260} height={60} borderRadius={8} />
        <Skeleton width={260} height={60} borderRadius={8} />
        <Skeleton width={260} height={60} borderRadius={8} />
        <Skeleton width={260} height={60} borderRadius={8} />
      </div>
      <Skeleton width={560} height={50} borderRadius={12} />
    </main>
  );
}

/**
 * Universal Dynamic Route Skeleton that automatically adapts based on pathname
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
