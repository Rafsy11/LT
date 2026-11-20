'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { SafeErrorState } from '@/components/ui/SafeErrorState';
import { useOdpMaps, type MapStatusFilter } from '../hooks/use-odp-maps';
import { OdpRadarMap } from './odp-radar-map';
import { OdpInspectorPanel } from './odp-inspector-panel';
import '@/styles/features/maps.css';

export function MapsView() {
  const {
    filteredItems,
    summary,
    loading,
    loadError,
    statusFilter,
    setStatusFilter,
    clusterFilter,
    setClusterFilter,
    availableClusters,
    search,
    setSearch,
    mapLayer,
    setMapLayer,
    showCustomerLinks,
    setShowCustomerLinks,
    selectedOdp,
    setSelectedOdpId,
    highlightedSia,
    refetch,
  } = useOdpMaps();

  const statusTabs: Array<{ key: MapStatusFilter; label: string; count: number; dotClass?: string }> = [
    { key: 'ALL', label: 'Semua ODP', count: summary.totalOdps },
    { key: 'NORMAL', label: 'Normal (≤ 28 dB)', count: summary.normalCount, dotClass: 'maps-dot--normal' },
    { key: 'ABNORMAL', label: 'Tidak Normal (> 28 dB)', count: summary.abnormalCount, dotClass: 'maps-dot--abnormal' },
    { key: 'UNMEASURED', label: 'Belum Diukur', count: summary.unmeasuredCount, dotClass: 'maps-dot--unmeasured' },
  ];

  return (
    <main className="maps-page" id="main-content">
      {/* Page Header */}
      <header className="overview-header">
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Peta Radar Datek ODP (Google Maps)</h1>
          <p className="overview-subtitle">
            Pemantauan sebaran titik datek ODP normal (redaman ≤ 28 dB) vs tidak normal (&gt; 28 dB
            atau gangguan aktif) terintegrasi navigasi Google Maps.
          </p>
        </div>

        <nav className="overview-toolbar" aria-label="Aksi peta ODP">
          <button
            type="button"
            className="button secondary"
            onClick={() => void refetch()}
            disabled={loading}
          >
            <Icon name="refresh" size={14} />
            <span>{loading ? 'Memuat...' : 'Segarkan Radar'}</span>
          </button>
        </nav>
      </header>

      {/* 4 Radar KPI Cards */}
      <section className="maps-kpi-grid" aria-label="Ringkasan Radar ODP">
        <article className="maps-kpi-card">
          <div>
            <span className="maps-kpi-label">Total Titik Datek ODP</span>
            <div className="maps-kpi-value">{summary.totalOdps}</div>
            <span className="maps-kpi-sub">{summary.mappedCustomers} pelanggan terhubung</span>
          </div>
          <Icon name="map" size={22} />
        </article>

        <article className="maps-kpi-card is-normal">
          <div>
            <span className="maps-kpi-label">ODP Normal</span>
            <div className="maps-kpi-value">{summary.normalCount}</div>
            <span className="maps-kpi-sub">Redaman bagus maks. 28 dB</span>
          </div>
          <Icon name="checkCircle" size={22} />
        </article>

        <article className="maps-kpi-card is-abnormal">
          <div>
            <span className="maps-kpi-label">ODP Tidak Normal</span>
            <div className="maps-kpi-value">{summary.abnormalCount}</div>
            <span className="maps-kpi-sub">
              {summary.badAttenuationCustomers} port redaman &gt; 28 dB / anomali
            </span>
          </div>
          <Icon name="radar" size={22} />
        </article>

        <article className="maps-kpi-card">
          <div>
            <span className="maps-kpi-label">Belum Diukur</span>
            <div className="maps-kpi-value">{summary.unmeasuredCount}</div>
            <span className="maps-kpi-sub">Menunggu hasil ukur OPM / OLT</span>
          </div>
          <Icon name="clock" size={22} />
        </article>
      </section>

      {/* Filter & Map Control Toolbar */}
      <section className="maps-toolbar" aria-label="Filter dan kontrol peta">
        <div className="maps-filter-group">
          <div className="maps-status-tabs" role="tablist" aria-label="Filter status radar ODP">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.key}
                className={`maps-status-tab ${statusFilter === tab.key ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.dotClass && <i className={`maps-dot ${tab.dotClass}`} />}
                <span>{tab.label}</span>
                <span style={{ opacity: 0.75 }}>({tab.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="maps-filter-group">
          <input
            type="search"
            aria-label="Cari ODP, pelanggan, atau nomor SIA"
            className="maps-search-input"
            placeholder="Cari ODP, SIA, pelanggan, PIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            aria-label="Filter cluster wilayah"
            className="maps-select"
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
          >
            <option value="Semua cluster">Semua Cluster</option>
            {availableClusters.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="button secondary"
            onClick={() => setMapLayer(mapLayer === 'street' ? 'satellite' : 'street')}
          >
            <Icon name="map" size={14} />
            <span>{mapLayer === 'street' ? 'Mode Satelit' : 'Mode Jalan'}</span>
          </button>

          <button
            type="button"
            className="button secondary"
            aria-pressed={showCustomerLinks}
            onClick={() => setShowCustomerLinks((prev) => !prev)}
          >
            <Icon name="network" size={14} />
            <span>{showCustomerLinks ? 'Garis Pelanggan: Aktif' : 'Garis Pelanggan: Mati'}</span>
          </button>
        </div>
      </section>

      {/* Main Split Map + Inspector Workspace */}
      {loadError && filteredItems.length === 0 ? (
        <SafeErrorState
          error={loadError}
          title="Gagal Memuat Peta Radar ODP"
          description={loadError}
          onRetry={() => void refetch()}
          variant="panel"
        />
      ) : (
        <section className="maps-workspace">
          <OdpRadarMap
            items={filteredItems}
            selectedOdp={selectedOdp}
            onSelectOdp={setSelectedOdpId}
            mapLayer={mapLayer}
            showCustomerLinks={showCustomerLinks}
          />
          <OdpInspectorPanel odp={selectedOdp} highlightedSia={highlightedSia} />
        </section>
      )}
    </main>
  );
}
