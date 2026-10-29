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

  return (
    <main className="technicians-page" style={{ paddingBottom: '32px' }}>
      {/* Page Heading & Redis Telemetry Beacon */}
      <div className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Manajemen Teknisi & Sesi Perangkat</h1>
          <p className="overview-subtitle">
            Kendali sesi mobile short-lived JWT/Redis, pengikatan perangkat (device binding), dan
            perlindungan integritas lapangan.
          </p>
        </div>

        <div className="overview-toolbar">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: 500,
              color: '#334155',
              boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
            }}
          >
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

          <button
            className="button"
            onClick={fetchTechs}
            disabled={loading}
            title="Segarkan data sesi teknisi"
            type="button"
            style={{
              padding: '6px 10px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '12px',
              boxShadow: '0 1px 2px rgba(27, 92, 162, 0.03)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* Permission Guard Banner */}
      {!canManageTech && (
        <div
          className="info-strip"
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
        </div>
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
