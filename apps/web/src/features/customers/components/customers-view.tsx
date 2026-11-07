'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { useCustomers } from '../hooks/use-customers';
import { CustomerStats } from './customer-stats';
import { CustomerFilters } from './customer-filters';
import { CustomerTable } from './customer-table';
import { CustomerDetailModal } from './customer-detail-modal';

export function CustomersView() {
  const {
    search,
    setSearch,
    cluster,
    setCluster,
    statusTab,
    setStatusTab,
    customers,
    loading,
    fetchCustomers,
    selectedCustomer,
    setSelectedCustomer,
    kecamatan,
    setKecamatan,
    kelurahan,
    setKelurahan,
    jalan,
    setJalan,
    isWilayahFilterOpen,
    setIsWilayahFilterOpen,
    resetWilayahFilters,
    availableClusters,
    clusterCounts,
    availableKecamatans,
    availableKelurahans,
    availableJalans,
    activeWilayahCount,
    clusterScoped,
    activeCount,
    pendingCount,
    criticalCount,
    isolatedCount,
    displayedCustomers,
  } = useCustomers();

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchCustomers();
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchCustomers]);

  return (
    <main className="customers-page" style={{ paddingBottom: '32px' }}>
      {/* Overview Command Header */}
      <header className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Master Data Pelanggan (SIA)</h1>
          <p className="overview-subtitle">
            Pusat data pelanggan FTTH, pengikatan nomor SIA, alokasi fisik port splitter, dan
            riwayat redaman optik (PRD 3.1 &amp; 5.1).
          </p>
        </div>

        <nav className="overview-toolbar" aria-label="Aksi bilah status pelanggan">
          <div className="overview-status-pill">
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#16a34a',
                display: 'inline-block',
                boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)',
              }}
            />
            PostgreSQL Master Data: Aktif
          </div>


        </nav>
      </header>

      {/* 4 Telemetry Metric Cards */}
      <CustomerStats
        totalCount={clusterScoped.length}
        activeCount={activeCount}
        pendingCount={pendingCount}
        criticalCount={criticalCount}
      />

      {/* Main Panel */}
      <section className="panel" style={{ padding: '16px 20px 24px' }}>
        <CustomerFilters
          cluster={cluster}
          setCluster={setCluster}
          totalRawCustomers={customers.length}
          availableClusters={availableClusters}
          clusterCounts={clusterCounts}
          search={search}
          setSearch={setSearch}
          isWilayahFilterOpen={isWilayahFilterOpen}
          setIsWilayahFilterOpen={setIsWilayahFilterOpen}
          activeWilayahCount={activeWilayahCount}
          statusTab={statusTab}
          setStatusTab={setStatusTab}
          clusterScopedLength={clusterScoped.length}
          activeCount={activeCount}
          pendingCount={pendingCount}
          criticalCount={criticalCount}
          isolatedCount={isolatedCount}
          resetWilayahFilters={resetWilayahFilters}
          kecamatan={kecamatan}
          setKecamatan={setKecamatan}
          kelurahan={kelurahan}
          setKelurahan={setKelurahan}
          jalan={jalan}
          setJalan={setJalan}
          availableKecamatans={availableKecamatans}
          availableKelurahans={availableKelurahans}
          availableJalans={availableJalans}
        />

        {/* High-Agency Enterprise Data Table */}
        <CustomerTable
          customers={displayedCustomers}
          onSelectCustomer={setSelectedCustomer}
          loading={loading}
        />
      </section>

      {/* Customer Detail & Attenuation Histories Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </main>
  );
}
