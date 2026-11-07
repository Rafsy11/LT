'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { useTechnicians } from '../hooks/use-technicians';
import { TechnicianStats } from './technician-stats';
import { TechnicianFilters } from './technician-filters';
import { TechnicianGrid } from './technician-grid';
import { TechnicianDetailModal } from './technician-detail-modal';

export function TechniciansView() {
  const {
    search,
    setSearch,
    cluster,
    setCluster,
    activeTab,
    setActiveTab,
    loading,
    processingUser,
    selectedTech,
    setSelectedTech,
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

  React.useEffect(() => {
    function handleGlobalRefresh() {
      fetchTechs();
    }
    window.addEventListener('app:refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('app:refresh-data', handleGlobalRefresh);
  }, [fetchTechs]);

  return (
    <main className="technicians-page" style={{ paddingBottom: '32px' }}>
      {/* Page Heading & Redis Telemetry Beacon */}
      <header className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Manajemen Teknisi & Sesi Perangkat</h1>
          <p className="overview-subtitle">
            Kendali sesi mobile short-lived JWT/Redis, pengikatan perangkat (device binding), dan
            perlindungan integritas lapangan.
          </p>
        </div>

        <nav className="overview-toolbar" aria-label="Aksi bilah status teknisi">
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
            Redis Session Store: Aktif
          </div>


        </nav>
      </header>

      {/* Permission Guard Banner */}
      {!canManageTech && (
        <aside
          className="info-strip"
          role="alert"
          style={{
            background: '#fffbeb',
            borderColor: '#fde68a',
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '12.5px',
          }}
        >
          <Icon name="lock" size={16} />
          <span>
            <b>Mode Peninjauan (Read-Only):</b> Akun Anda tidak memiliki izin{' '}
            <code>tech:manage</code>. Tombol Force Logout dan Kunci Akun dinonaktifkan secara
            kondisional.
          </span>
        </aside>
      )}

      {/* 4 Telemetry Metric Cards */}
      <TechnicianStats
        totalCount={clusterScoped.length}
        activeSessionsCount={activeSessionsCount}
        busyCount={busyCount}
        revokedCount={revokedCount}
        disabledCount={disabledCount}
      />

      {/* Main Panel */}
      <section className="panel" style={{ padding: '16px 20px 24px' }}>
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

        {/* Technician Cards Grid */}
        <TechnicianGrid
          technicians={displayedTechs}
          processingUser={processingUser}
          canManageTech={canManageTech}
          onSelectTech={setSelectedTech}
          onForceLogout={handleForceLogout}
          onToggleAccount={handleToggleAccount}
          loading={loading}
        />
      </section>

      {/* Technician Detail & Hardware Inspection Modal */}
      {selectedTech && (
        <TechnicianDetailModal
          technician={selectedTech}
          onClose={() => setSelectedTech(null)}
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
