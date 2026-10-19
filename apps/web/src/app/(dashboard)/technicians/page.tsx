'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { TechnicianDetailModal } from '@/components/modals/TechnicianDetailModal';
import type { TechnicianListItem } from '@/services/technician.service';

type FilterTab = 'all' | 'active_session' | 'busy' | 'revoked' | 'inactive';

export default function TechniciansPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState<TechnicianListItem | null>(null);

  const actionLockRef = useRef<boolean>(false);

  const { canManageTech } = useAuth();
  const { showSuccess, showError } = useToast();

  const fetchTechs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/technicians');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTechnicians(json.data);
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTechs();
  }, []);

  /**
   * Instant Session Revocation (Force Logout) - PRD Section 2.2 & agent.md Law 4.
   * Debounced with 1-ms action lock & guarded by `tech:manage` permission.
   */
  const handleForceLogout = async (usernameOrId: string) => {
    if (!canManageTech) {
      showError({
        code: 'FORBIDDEN',
        message: 'Akses Ditolak: Anda tidak memiliki izin tech:manage untuk melakukan Force Logout teknisi.',
      });
      return;
    }

    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setProcessingUser(usernameOrId);

    try {
      const res = await fetch(`/api/v1/admin/technicians/${usernameOrId}/force-logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin Force Logout (Sesi Dicabut)' }),
      });
      const json = await res.json();

      if (json.success) {
        showSuccess(json.message || `Sesi perangkat teknisi ${usernameOrId} berhasil dicabut.`);
        await fetchTechs();

        // Update modal state if open
        if (selectedTech && (selectedTech.username === usernameOrId || selectedTech.id === usernameOrId)) {
          setSelectedTech((prev) =>
            prev ? { ...prev, sessionStatus: 'REVOKED', lastActiveAt: 'Baru saja dicabut oleh Admin' } : null
          );
        }
      } else {
        showError(json.error);
      }
    } catch (e: unknown) {
      showError(e);
    } finally {
      actionLockRef.current = false;
      setProcessingUser(null);
    }
  };

  /**
   * Toggles account active status (Lock / Unlock account).
   */
  const handleToggleAccount = async (usernameOrId: string) => {
    if (!canManageTech) {
      showError({
        code: 'FORBIDDEN',
        message: 'Akses Ditolak: Anda tidak memiliki izin tech:manage untuk mengubah status akun teknisi.',
      });
      return;
    }

    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setProcessingUser(usernameOrId);

    try {
      const res = await fetch(`/api/v1/admin/technicians/${usernameOrId}/toggle`, {
        method: 'POST',
      });
      const json = await res.json();

      if (json.success) {
        showSuccess(json.message || `Status akun teknisi ${usernameOrId} berhasil diperbarui.`);
        await fetchTechs();

        if (selectedTech && (selectedTech.username === usernameOrId || selectedTech.id === usernameOrId)) {
          setSelectedTech((prev) => (prev ? { ...prev, isActive: !prev.isActive } : null));
        }
      } else {
        showError(json.error);
      }
    } catch (e: unknown) {
      showError(e);
    } finally {
      actionLockRef.current = false;
      setProcessingUser(null);
    }
  };

  // Scoped by Cluster & Search
  const clusterScoped = useMemo(() => {
    return technicians.filter((t) => {
      const matchesCluster =
        cluster === 'Semua cluster' ||
        t.cluster.toLowerCase().includes(cluster.toLowerCase().replace('bandung ', ''));
      const matchesSearch =
        search === '' ||
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        t.username.toLowerCase().includes(search.toLowerCase()) ||
        t.cluster.toLowerCase().includes(search.toLowerCase()) ||
        (t.deviceId && t.deviceId.toLowerCase().includes(search.toLowerCase()));
      return matchesCluster && matchesSearch;
    });
  }, [technicians, cluster, search]);

  // Telemetry Counts
  const activeSessionsCount = useMemo(
    () => clusterScoped.filter((t) => t.sessionStatus === 'ACTIVE_SESSION').length,
    [clusterScoped]
  );
  const busyCount = useMemo(
    () => clusterScoped.filter((t) => t.activeTicketsCount > 0).length,
    [clusterScoped]
  );
  const revokedCount = useMemo(
    () => clusterScoped.filter((t) => t.sessionStatus === 'REVOKED').length,
    [clusterScoped]
  );
  const disabledCount = useMemo(
    () => clusterScoped.filter((t) => !t.isActive).length,
    [clusterScoped]
  );

  // Tab Filtering
  const displayedTechs = useMemo(() => {
    switch (activeTab) {
      case 'active_session':
        return clusterScoped.filter((t) => t.sessionStatus === 'ACTIVE_SESSION');
      case 'busy':
        return clusterScoped.filter((t) => t.activeTicketsCount > 0);
      case 'revoked':
        return clusterScoped.filter((t) => t.sessionStatus === 'REVOKED');
      case 'inactive':
        return clusterScoped.filter((t) => !t.isActive);
      case 'all':
      default:
        return clusterScoped;
    }
  }, [clusterScoped, activeTab]);

  return (
    <main className="technicians-page" style={{ paddingBottom: '32px' }}>
      {/* Page Heading & Redis Telemetry Beacon */}
      <div className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Manajemen Teknisi & Sesi Perangkat</h1>
          <p className="overview-subtitle">
            Kendali sesi mobile short-lived JWT/Redis, pengikatan perangkat (device binding), dan perlindungan integritas lapangan.
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
            <b>Mode Peninjauan (Read-Only):</b> Akun Anda tidak memiliki izin <code>tech:manage</code>. Tombol Force Logout dan Kunci Akun dinonaktifkan secara kondisional.
          </span>
        </div>
      )}

      {/* 4 Telemetry Metric Cards */}
      <section className="technicians-stats-grid" aria-label="Statistik Teknisi & Sesi" style={{ marginBottom: '24px' }}>
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Teknisi Terdaftar
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>
              {clusterScoped.length}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Pengguna aplikasi mobile terdaftar
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Sesi Mobile Aktif
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#166534', fontWeight: 500 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                Online
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#166534', margin: '8px 0 2px' }}>
              {activeSessionsCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Token JWT sah tersinkron di Redis
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Sedang Bertugas
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#1b5ca2', margin: '8px 0 2px' }}>
              {busyCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Memegang tiket terbuka di lapangan
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Sesi Dicabut / Kunci
              </span>
            </div>
            <div
              className="stat-card-value"
              style={{
                fontSize: '26px',
                fontWeight: 700,
                color: (revokedCount > 0 || disabledCount > 0) ? '#be123c' : '#0f172a',
                margin: '8px 0 2px',
              }}
            >
              {revokedCount + disabledCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                {revokedCount} sesi dicabut · {disabledCount} akun dikunci
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* Main Panel */}
      <section className="panel" style={{ padding: '16px 20px 24px' }}>
        {/* Toolbar: Search on Left, Cluster + Filter Tabs on Right */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            paddingBottom: '14px',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          {/* Left: Clean Inline Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#ffffff',
              border: '1px solid #dce7f0',
              borderRadius: '6px',
              padding: '6px 12px',
              width: '320px',
              color: '#64748b',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Icon name="search" size={14} />
            </span>
            <input
              aria-label="Cari teknisi"
              placeholder="Cari nama, username, ID perangkat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                fontSize: '12.5px',
                color: '#0f172a',
                padding: 0,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Hapus pencarian"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>

          {/* Right: Cluster Dropdown beside Segmented Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              aria-label="Filter Cluster"
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                color: '#334155',
                height: '31px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
              <option>Bandung Selatan</option>
              <option>Cimahi</option>
              <option>Rancaekek</option>
            </select>

            {/* Segmented Filter Tabs */}
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '6px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === 'all' ? 600 : 500,
                  background: activeTab === 'all' ? '#ffffff' : 'transparent',
                  color: activeTab === 'all' ? '#0f172a' : '#64748b',
                  boxShadow: activeTab === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Semua ({clusterScoped.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('active_session')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === 'active_session' ? 600 : 500,
                  background: activeTab === 'active_session' ? '#ffffff' : 'transparent',
                  color: activeTab === 'active_session' ? '#0f172a' : '#64748b',
                  boxShadow: activeTab === 'active_session' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Sesi Aktif ({activeSessionsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('busy')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === 'busy' ? 600 : 500,
                  background: activeTab === 'busy' ? '#ffffff' : 'transparent',
                  color: activeTab === 'busy' ? '#0f172a' : '#64748b',
                  boxShadow: activeTab === 'busy' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Bertugas ({busyCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('revoked')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === 'revoked' ? 600 : 500,
                  background: activeTab === 'revoked' ? '#ffffff' : 'transparent',
                  color: activeTab === 'revoked' ? '#0f172a' : '#64748b',
                  boxShadow: activeTab === 'revoked' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Sesi Dicabut ({revokedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('inactive')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === 'inactive' ? 600 : 500,
                  background: activeTab === 'inactive' ? '#ffffff' : 'transparent',
                  color: activeTab === 'inactive' ? '#0f172a' : '#64748b',
                  boxShadow: activeTab === 'inactive' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Nonaktif ({disabledCount})
              </button>
            </div>
          </div>
        </div>

        {/* Technician Cards Grid */}
        {displayedTechs.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '13px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px dashed #cbd5e1',
            }}
          >
            Tidak ada teknisi yang sesuai dengan filter pencarian ini.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '14px',
            }}
          >
            {displayedTechs.map((tech) => {
              const isProcessing = processingUser === tech.username || processingUser === tech.id;
              const isActiveSession = tech.sessionStatus === 'ACTIVE_SESSION';
              const isRevokedSession = tech.sessionStatus === 'REVOKED';

              return (
                <article
                  key={tech.id || tech.username}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  {/* Card Header: Avatar, Name, Cluster & Unified Status Pill */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <DefaultAvatar size={38} name={tech.fullName} />
                      <div>
                        <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>
                          {tech.fullName}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                            @{tech.username}
                          </span>
                          <span style={{ color: '#cbd5e1', fontSize: '11px' }}>·</span>
                          <span style={{ fontSize: '11px', color: '#475569' }}>{tech.cluster}</span>
                        </div>
                      </div>
                    </div>

                    {/* Single Unified Status Pill */}
                    <div>
                      {!tech.isActive ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#64748b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Icon name="lock" size={11} />
                          Akun Terkunci
                        </span>
                      ) : isActiveSession ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#f0fdf4',
                            border: '1px solid #dcfce7',
                            color: '#15803d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
                          Sesi Aktif
                        </span>
                      ) : isRevokedSession ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#fff1f2',
                            border: '1px solid #ffe4e6',
                            color: '#be123c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Sesi Dicabut
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#64748b',
                          }}
                        >
                          Belum Login
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Device Telemetry Box */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '11.5px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '11px' }}>Perangkat Terikat</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>
                        {tech.deviceModel ? tech.deviceModel.split('(')[0].trim() : 'Belum Terikat'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '11px' }}>Device ID / App</span>
                      <span style={{ fontFamily: 'monospace', color: '#0f172a', fontSize: '11px' }}>
                        {tech.deviceId || 'DEV-N/A'}{' '}
                        <span style={{ color: '#cbd5e1' }}>·</span>{' '}
                        <span style={{ color: '#475569', fontWeight: 500 }}>{tech.appVersion || 'v1.0.0'}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '11px' }}>Integritas Lapangan</span>
                      {tech.isMockLocationDetected ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#b91c1c',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Icon name="alert" size={11} />
                          Fake GPS Terdeteksi!
                        </span>
                      ) : (
                        <span style={{ color: '#475569', fontWeight: 500, fontSize: '11px' }}>
                          GPS Valid (Normal)
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                      <span style={{ color: '#94a3b8', fontSize: '10.5px' }}>Sesi Terakhir</span>
                      <span style={{ color: '#64748b', fontSize: '10.5px' }}>{tech.lastActiveAt || 'Tidak ada catatan'}</span>
                    </div>
                  </div>

                  {/* Work Order Info Strip */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      color: '#475569',
                      padding: '7px 10px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{tech.activeTicketsCount}</span>
                      <span>Tiket Aktif</span>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: '#64748b' }}>{tech.completedTicketsCount} Selesai</span>
                    </div>

                    {tech.activeWorkOrders && tech.activeWorkOrders.length > 0 && (
                      <Link
                        href={`/tickets?search=${tech.activeWorkOrders[0].ticketNumber}`}
                        style={{
                          fontSize: '11px',
                          color: '#0e5b92',
                          fontFamily: 'monospace',
                          textDecoration: 'none',
                          fontWeight: 600,
                          padding: '2px 7px',
                          background: '#f8fafc',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                        }}
                        title={`Buka tiket ${tech.activeWorkOrders[0].ticketNumber}`}
                      >
                        {tech.activeWorkOrders[0].ticketNumber}
                      </Link>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    {/* Detail Modal Button */}
                    <button
                      className="button"
                      onClick={() => setSelectedTech(tech)}
                      type="button"
                      style={{
                        flex: 1,
                        height: '32px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '0 10px',
                        fontSize: '11.5px',
                        fontWeight: 500,
                        color: '#334155',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Detail Sesi
                    </button>

                    {/* Force Logout Button */}
                    {/* Force Logout Button - Icon Only (PRD 2.2 / Law 4) */}
                    {canManageTech ? (
                      <button
                        className="button"
                        disabled={isProcessing || !isActiveSession}
                        onClick={() => handleForceLogout(tech.username)}
                        title={isActiveSession ? 'Cabut sesi token JWT mobile' : 'Teknisi tidak memiliki sesi aktif'}
                        aria-label={isActiveSession ? 'Cabut sesi' : 'Sesi nonaktif'}
                        type="button"
                        style={{
                          width: '32px',
                          height: '32px',
                          flexShrink: 0,
                          background: isActiveSession ? '#ffffff' : '#f8fafc',
                          border: `1px solid ${isActiveSession ? '#fecaca' : '#e2e8f0'}`,
                          borderRadius: '6px',
                          padding: 0,
                          color: isActiveSession ? '#dc2626' : '#cbd5e1',
                          cursor: isActiveSession ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isProcessing ? (
                          <span style={{ fontSize: '10px' }}>...</span>
                        ) : (
                          <Icon name="logOut" size={15} />
                        )}
                      </button>
                    ) : (
                      <button
                        className="button disabled"
                        disabled
                        title="Izin tech:manage diperlukan"
                        aria-label="Izin diperlukan"
                        type="button"
                        style={{
                          width: '32px',
                          height: '32px',
                          flexShrink: 0,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: 0,
                          color: '#cbd5e1',
                          cursor: 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="logOut" size={15} />
                      </button>
                    )}

                    {/* Account Lock Toggle */}
                    {canManageTech && (
                      <button
                        className="button"
                        disabled={isProcessing}
                        onClick={() => handleToggleAccount(tech.username)}
                        title={tech.isActive ? 'Kunci akun teknisi ini' : 'Buka kunci akun teknisi ini'}
                        type="button"
                        style={{
                          width: '32px',
                          height: '32px',
                          padding: 0,
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          color: tech.isActive ? '#64748b' : '#b91c1c',
                          cursor: isProcessing ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Icon name={tech.isActive ? 'lock' : 'unlock'} size={13} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Technician Detail & Hardware Inspection Modal */}
      {selectedTech && (
        <TechnicianDetailModal
          technician={selectedTech}
          onClose={() => setSelectedTech(null)}
          onForceLogout={handleForceLogout}
          onToggleAccount={handleToggleAccount}
          canManageTech={canManageTech}
          isProcessing={processingUser === selectedTech.username || processingUser === selectedTech.id}
        />
      )}
    </main>
  );
}
