'use client';

import React, { useState } from 'react';
import { PERMISSIONS } from '@repo/shared';
import { useAuth } from '@/providers';
import { Icon } from '@/components/ui/Icon';
import { CustomersSkeleton } from '@/components/ui/PageSkeleton';
import { useCustomers } from '../hooks/use-customers';
import { CustomerStats } from './customer-stats';
import { CustomerFilters } from './customer-filters';
import { CustomerTable } from './customer-table';
import { CustomerDetailModal } from './customer-detail-modal';
import { CustomerFormModal } from './customer-form-modal';
import '@/styles/features/customers.css';

export function CustomersView() {
  const { hasPermission } = useAuth();
  const [formModalOpen, setFormModalOpen] = useState(false);

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
      fetchCustomers(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchCustomers]);

  if (loading && customers.length === 0) {
    return <CustomersSkeleton />;
  }

  return (
    <main className="customers-page" id="main-content" style={{ paddingBottom: '32px' }}>
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
            <span className="status-dot status-dot--ok" aria-hidden="true" />
            PostgreSQL Master Data: Aktif
          </div>
          {hasPermission(PERMISSIONS.CUSTOMER_UPDATE) && (
            <button
              type="button"
              className="button primary"
              onClick={() => setFormModalOpen(true)}
            >
              <Icon name="plus" size={14} />
              <span>Tambah Pelanggan</span>
            </button>
          )}
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
          onUpdated={() => {
            void fetchCustomers(true);
          }}
        />
      )}

      {/* Create Customer Modal */}
      <CustomerFormModal
        isOpen={formModalOpen}
        clusterOptions={availableClusters}
        onClose={() => setFormModalOpen(false)}
        onCreated={() => {
          void fetchCustomers(true);
        }}
      />
    </main>
  );
}
