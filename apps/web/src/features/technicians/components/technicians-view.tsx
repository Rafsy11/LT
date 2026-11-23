'use client';

import React, { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TechniciansSkeleton } from '@/components/ui/PageSkeleton';
import { useTechnicians } from '../hooks/use-technicians';
import { TechnicianStats } from './technician-stats';
import { TechnicianFilters } from './technician-filters';
import { TechnicianGrid } from './technician-grid';
import { TechnicianDetailModal } from './technician-detail-modal';
import '@/styles/features/technicians.css';

export function TechniciansView() {
  const {
    search,
    setSearch,
    cluster,
    setCluster,
    activeTab,
    setActiveTab,
    technicians,
    loading,
    isRefreshing,
    loadError,
    processingUser,
    selectedTech,
    modalIntent,
    openTechModal,
    closeTechModal,
    canManageTech,
    fetchTechs,
    handleForceLogout,
    handleToggleAccount,
    clusterScoped,
    activeSessionsCount,
    busyCount,
    revokedCount,
    disabledCount,
    displayedTechs,
  } = useTechnicians();

  useEffect(() => {
    function handleGlobalRefresh() {
      void fetchTechs(true);
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchTechs]);

  if (loading && technicians.length === 0) {
    return <TechniciansSkeleton />;
  }

  const statusTone = loadError ? 'warn' : loading ? 'loading' : 'ok';
  const statusLabel = loadError
    ? 'Pemantauan Sesi: Gangguan'
    : loading
      ? 'Pemantauan Sesi: Memuat...'
      : 'Pemantauan Sesi: Aktif';

  return (
    <main className="technicians-page" id="main-content">
      {/* Page Header */}
      <header className="overview-header technicians-header">
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Teknisi Lapangan &amp; Sesi Perangkat</h1>
          <p className="overview-subtitle">
            Pantau status sesi aplikasi mobile, pengikatan perangkat, dan beban tiket aktif teknisi
            lapangan.
          </p>
        </div>

        <div className="overview-toolbar technicians-toolbar" role="toolbar" aria-label="Kontrol halaman teknisi">
          <div className={`tech-header-status tech-header-status--${statusTone}`} role="status" aria-live="polite">
            <span className="tech-header-status-dot" aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>

          <button
            type="button"
            className="tech-refresh-btn"
            onClick={() => void fetchTechs(true)}
            disabled={isRefreshing}
          >
            <Icon name="refresh" size={14} />
            <span>{isRefreshing ? 'Memuat...' : 'Muat Ulang'}</span>
          </button>
        </div>
      </header>

      {/* Permission Guard Notice */}
      {!canManageTech && (
        <aside className="tech-readonly-banner" role="status">
          <Icon name="lock" size={15} />
          <span>
            <strong>Mode Peninjauan:</strong> Akun Anda hanya memiliki akses lihat. Aksi cabut sesi
            dan kunci akun teknisi hanya tersedia untuk administrator yang berwenang.
          </span>
        </aside>
      )}

      {/* Interactive 4 KPI Cards */}
      <TechnicianStats
        totalCount={clusterScoped.length}
        activeSessionsCount={activeSessionsCount}
        busyCount={busyCount}
        revokedCount={revokedCount}
        disabledCount={disabledCount}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Directory Panel */}
      <section className="panel technicians-directory-panel" aria-label="Direktori teknisi lapangan">
        <TechnicianFilters
          search={search}
          setSearch={setSearch}
          cluster={cluster}
          setCluster={setCluster}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          clusterScopedLength={clusterScoped.length}
          activeSessionsCount={activeSessionsCount}
          busyCount={busyCount}
          revokedCount={revokedCount}
          disabledCount={disabledCount}
        />

        <TechnicianGrid
          technicians={displayedTechs}
          processingUser={processingUser}
          canManageTech={canManageTech}
          onOpenModal={openTechModal}
          loading={loading}
          loadError={loadError}
          onRetry={() => void fetchTechs(true)}
          hasActiveFilters={
            Boolean(search.trim()) || cluster !== 'Semua cluster' || activeTab !== 'all'
          }
          onResetFilters={() => {
            setSearch('');
            setCluster('Semua cluster');
            setActiveTab('all');
          }}
        />
      </section>

      {/* Technician Session Detail & Action Confirmation Modal */}
      {selectedTech && (
        <TechnicianDetailModal
          technician={selectedTech}
          initialIntent={modalIntent}
          onClose={closeTechModal}
          onForceLogout={handleForceLogout}
          onToggleAccount={handleToggleAccount}
          canManageTech={canManageTech}
          isProcessing={
            processingUser === selectedTech.username || processingUser === selectedTech.id
          }
        />
      )}
    </main>
  );
}
