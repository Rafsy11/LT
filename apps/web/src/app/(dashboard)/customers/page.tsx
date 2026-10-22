'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { classifyDbm } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { CustomerDetailModal } from '@/components/modals/CustomerDetailModal';
import type { CustomerListItem } from '@/services/customer.service';

type CustomerStatusTab = 'all' | 'ACTIVE' | 'PENDING_INSTALL' | 'critical' | 'ISOLATED';

function SignalStrengthBars({ status }: { status: 'normal' | 'warning' | 'critical' | 'neutral' }) {
  const activeColor =
    status === 'normal' ? '#16a34a' : status === 'warning' ? '#d97706' : status === 'critical' ? '#dc2626' : '#cbd5e1';
  const activeBars = status === 'normal' ? 4 : status === 'warning' ? 2 : status === 'critical' ? 1 : 0;

  return (
    <svg
      width="14"
      height="13"
      viewBox="0 0 14 13"
      fill="none"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px' }}
      aria-label={`Kualitas redaman: ${status}`}
    >
      <rect x="0.5" y="9.5" width="2" height="3.5" rx="0.5" fill={activeBars >= 1 ? activeColor : '#e2e8f0'} />
      <rect x="4" y="6.5" width="2" height="6.5" rx="0.5" fill={activeBars >= 2 ? activeColor : '#e2e8f0'} />
      <rect x="7.5" y="3.5" width="2" height="9.5" rx="0.5" fill={activeBars >= 3 ? activeColor : '#e2e8f0'} />
      <rect x="11" y="0.5" width="2" height="12.5" rx="0.5" fill={activeBars >= 4 ? activeColor : '#e2e8f0'} />
    </svg>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [statusTab, setStatusTab] = useState<CustomerStatusTab>('all');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);

  // Filter Spesifikasi Wilayah: Kecamatan, Kelurahan, Jalan
  const [kecamatan, setKecamatan] = useState('Semua kecamatan');
  const [kelurahan, setKelurahan] = useState('Semua kelurahan');
  const [jalan, setJalan] = useState('Semua jalan');
  const [isWilayahFilterOpen, setIsWilayahFilterOpen] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/customers');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCustomers(json.data);
      }
    } catch (err) {
      console.error('[CustomersPage] Gagal mengambil data pelanggan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Distinct Options for Cluster Navigation Tabs
  const availableClusters = useMemo(() => {
    const defaultList = ['Bandung Utara', 'Bandung Selatan', 'Bandung Timur', 'Bandung Barat', 'Cimahi', 'Rancaekek'];
    const set = new Set<string>(defaultList);
    customers.forEach((c) => {
      if (c.cluster) set.add(c.cluster);
    });
    return Array.from(set);
  }, [customers]);

  const clusterCounts = useMemo(() => {
    const map: Record<string, number> = { 'Semua cluster': customers.length };
    customers.forEach((c) => {
      const match = availableClusters.find(
        (cl) =>
          c.cluster.toLowerCase().trim() === cl.toLowerCase().trim() ||
          c.cluster.toLowerCase().includes(cl.toLowerCase().replace('bandung ', '').trim())
      );
      if (match) {
        map[match] = (map[match] || 0) + 1;
      }
    });
    return map;
  }, [customers, availableClusters]);

  // Distinct Options for Wilayah Filters
  const availableKecamatans = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.kecamatan) set.add(c.kecamatan);
    });
    return Array.from(set).sort();
  }, [customers]);

  const availableKelurahans = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.kelurahan) {
        if (kecamatan === 'Semua kecamatan' || c.kecamatan?.toLowerCase() === kecamatan.toLowerCase()) {
          set.add(c.kelurahan);
        }
      }
    });
    return Array.from(set).sort();
  }, [customers, kecamatan]);

  const availableJalans = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.street) {
        const matchKec = kecamatan === 'Semua kecamatan' || c.kecamatan?.toLowerCase() === kecamatan.toLowerCase();
        const matchKel = kelurahan === 'Semua kelurahan' || c.kelurahan?.toLowerCase() === kelurahan.toLowerCase();
        if (matchKec && matchKel) {
          set.add(c.street);
        }
      }
    });
    return Array.from(set).sort();
  }, [customers, kecamatan, kelurahan]);

  const activeWilayahCount = useMemo(() => {
    return (
      (kecamatan !== 'Semua kecamatan' ? 1 : 0) +
      (kelurahan !== 'Semua kelurahan' ? 1 : 0) +
      (jalan !== 'Semua jalan' ? 1 : 0)
    );
  }, [kecamatan, kelurahan, jalan]);

  const resetWilayahFilters = () => {
    setKecamatan('Semua kecamatan');
    setKelurahan('Semua kelurahan');
    setJalan('Semua jalan');
  };

  // Filtered by Cluster, Wilayah (Kecamatan, Kelurahan, Jalan), and Search
  const clusterScoped = useMemo(() => {
    return customers.filter((c) => {
      const matchesCluster =
        cluster === 'Semua cluster' ||
        c.cluster.toLowerCase().trim() === cluster.toLowerCase().trim() ||
        c.cluster.toLowerCase().includes(cluster.toLowerCase().replace('bandung ', '').trim());

      const matchesSearch =
        search === '' ||
        c.fullName.toLowerCase().includes(search.toLowerCase()) ||
        c.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
        c.address.toLowerCase().includes(search.toLowerCase()) ||
        c.splitterCode.toLowerCase().includes(search.toLowerCase()) ||
        c.cluster.toLowerCase().includes(search.toLowerCase()) ||
        Boolean(c.kecamatan && c.kecamatan.toLowerCase().includes(search.toLowerCase())) ||
        Boolean(c.kelurahan && c.kelurahan.toLowerCase().includes(search.toLowerCase())) ||
        Boolean(c.street && c.street.toLowerCase().includes(search.toLowerCase()));

      const matchesKecamatan =
        kecamatan === 'Semua kecamatan' ||
        (c.kecamatan && c.kecamatan.toLowerCase() === kecamatan.toLowerCase()) ||
        c.address.toLowerCase().includes(kecamatan.toLowerCase());

      const matchesKelurahan =
        kelurahan === 'Semua kelurahan' ||
        (c.kelurahan && c.kelurahan.toLowerCase() === kelurahan.toLowerCase()) ||
        c.address.toLowerCase().includes(kelurahan.toLowerCase());

      const matchesJalan =
        jalan === 'Semua jalan' ||
        (c.street && c.street.toLowerCase() === jalan.toLowerCase()) ||
        c.address.toLowerCase().includes(jalan.toLowerCase());

      return matchesCluster && matchesSearch && matchesKecamatan && matchesKelurahan && matchesJalan;
    });
  }, [customers, cluster, search, kecamatan, kelurahan, jalan]);

  // Telemetry Counts
  const activeCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'ACTIVE').length,
    [clusterScoped]
  );
  const pendingCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'PENDING_INSTALL').length,
    [clusterScoped]
  );
  const criticalCount = useMemo(
    () => clusterScoped.filter((c) => classifyDbm(c.currentAttenuation) === 'Critical').length,
    [clusterScoped]
  );
  const isolatedCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'ISOLATED').length,
    [clusterScoped]
  );

  // Tab Filter
  const displayedCustomers = useMemo(() => {
    switch (statusTab) {
      case 'ACTIVE':
        return clusterScoped.filter((c) => c.status === 'ACTIVE');
      case 'PENDING_INSTALL':
        return clusterScoped.filter((c) => c.status === 'PENDING_INSTALL');
      case 'critical':
        return clusterScoped.filter((c) => classifyDbm(c.currentAttenuation) === 'Critical');
      case 'ISOLATED':
        return clusterScoped.filter((c) => c.status === 'ISOLATED');
      case 'all':
      default:
        return clusterScoped;
    }
  }, [clusterScoped, statusTab]);

  return (
    <main className="customers-page" style={{ paddingBottom: '32px' }}>
      {/* Overview Command Header */}
      <div className="overview-header" style={{ marginBottom: '28px' }}>
        <div className="overview-header-copy">
          <h1 className="overview-greeting">Master Data Pelanggan (SIA)</h1>
          <p className="overview-subtitle">
            Pusat data pelanggan FTTH, pengikatan nomor SIA, alokasi fisik port splitter, dan riwayat redaman optik (PRD 3.1 &amp; 5.1).
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
            PostgreSQL Master Data: Aktif
          </div>

          <button
            className="button"
            onClick={fetchCustomers}
            disabled={loading}
            title="Segarkan data pelanggan"
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

      {/* 4 Telemetry Metric Cards */}
      <section className="customers-stats-grid" aria-label="Statistik Master Data Pelanggan" style={{ marginBottom: '24px' }}>
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Total Pelanggan
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>
              {clusterScoped.length}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                SIA terdaftar di wilayah terpilih
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Layanan Aktif
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#166534', fontWeight: 500 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                Online
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#166534', margin: '8px 0 2px' }}>
              {activeCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Port splitter terkunci aktif
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Menunggu Instalasi
              </span>
            </div>
            <div className="stat-card-value" style={{ fontSize: '26px', fontWeight: 700, color: '#b45309', margin: '8px 0 2px' }}>
              {pendingCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Tiket PSB dalam antrean teknisi
              </span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Redaman Kritis
              </span>
            </div>
            <div
              className="stat-card-value"
              style={{
                fontSize: '26px',
                fontWeight: 700,
                color: criticalCount > 0 ? '#be123c' : '#0f172a',
                margin: '8px 0 2px',
              }}
            >
              {criticalCount}
            </div>
            <div className="stat-card-footer" style={{ borderTop: 'none', padding: 0 }}>
              <span className="caption" style={{ fontSize: '11.5px', color: '#64748b' }}>
                Nilai redaman optik &lt; -25.0 dBm
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* Main Panel */}
      <section className="panel" style={{ padding: '16px 20px 24px' }}>
        {/* Cluster Tabs Navigation Bar */}
        <div className="customer-cluster-tab-bar" role="tablist" aria-label="Filter Wilayah Cluster">
          <button
            type="button"
            className={`customer-cluster-tab-btn ${cluster === 'Semua cluster' ? 'is-active' : ''}`}
            onClick={() => setCluster('Semua cluster')}
          >
            <span>Semua Wilayah</span>
            <span className="customer-tab-count-badge">{customers.length}</span>
          </button>
          {availableClusters.map((cName) => {
            const count = clusterCounts[cName] || 0;
            const isAct =
              cluster === cName ||
              (cluster !== 'Semua cluster' &&
                cluster.toLowerCase().replace('bandung ', '').trim() ===
                  cName.toLowerCase().replace('bandung ', '').trim());
            return (
              <button
                key={cName}
                type="button"
                className={`customer-cluster-tab-btn ${isAct ? 'is-active' : ''}`}
                onClick={() => setCluster(cName)}
              >
                <span>{cName}</span>
                <span className="customer-tab-count-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary Toolbar: Search + Filter Wilayah on Left, Segmented Status Filter Tabs on Right */}
        <div className="customer-sub-toolbar">
          {/* Left: Search Box + Integrated Filter Wilayah */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="customer-search-box">
              <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Icon name="search" size={14} />
              </span>
              <input
                aria-label="Cari pelanggan"
                placeholder="Cari nama, nomor SIA, ODP, atau alamat..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="customer-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Hapus pencarian"
                  className="customer-search-clear"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </div>

            {/* Tombol Filter Wilayah (Kecamatan, Kelurahan, Jalan) */}
            <button
              type="button"
              onClick={() => setIsWilayahFilterOpen(!isWilayahFilterOpen)}
              title="Buka filter spesifikasi wilayah (Kecamatan, Kelurahan, Jalan)"
              className={`btn-wilayah-toggle ${isWilayahFilterOpen || activeWilayahCount > 0 ? 'is-active' : ''}`}
            >
              <Icon name="filter" size={13} />
              <span>Filter Wilayah</span>
              {activeWilayahCount > 0 && (
                <span className="wilayah-badge-count">
                  {activeWilayahCount}
                </span>
              )}
              <Icon
                name="chevron"
                size={12}
                style={{
                  transform: isWilayahFilterOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>
          </div>

          {/* Right: Segmented Status Filter Tabs (Clean, NO cluster dropdown beside "Semua") */}
          <div className="customer-status-segmented-tabs" role="tablist" aria-label="Filter Status Layanan">
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className={`customer-status-tab-btn ${statusTab === 'all' ? 'is-active' : ''}`}
            >
              <span>Semua</span>
              <span className="customer-status-tab-count">({clusterScoped.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('ACTIVE')}
              className={`customer-status-tab-btn ${statusTab === 'ACTIVE' ? 'is-active' : ''}`}
            >
              <span className="status-dot-mini active" />
              <span>Aktif</span>
              <span className="customer-status-tab-count">({activeCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('PENDING_INSTALL')}
              className={`customer-status-tab-btn ${statusTab === 'PENDING_INSTALL' ? 'is-active' : ''}`}
            >
              <span className="status-dot-mini pending" />
              <span>Pending PSB</span>
              <span className="customer-status-tab-count">({pendingCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('critical')}
              className={`customer-status-tab-btn ${statusTab === 'critical' ? 'is-active' : ''}`}
            >
              <span className="status-dot-mini critical" />
              <span>Kritis</span>
              <span className="customer-status-tab-count">({criticalCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('ISOLATED')}
              className={`customer-status-tab-btn ${statusTab === 'ISOLATED' ? 'is-active' : ''}`}
            >
              <span className="status-dot-mini isolated" />
              <span>Terisolir</span>
              <span className="customer-status-tab-count">({isolatedCount})</span>
            </button>
          </div>
        </div>

        {/* Panel Filter Spesifikasi Wilayah (Kecamatan, Kelurahan, Jalan) */}
        {isWilayahFilterOpen && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#1e3a5f' }}>
                <Icon name="pin" size={14} />
                <span>Filter Spesifikasi Wilayah Pelanggan</span>
              </div>
              {activeWilayahCount > 0 && (
                <button
                  type="button"
                  onClick={resetWilayahFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                  }}
                >
                  <Icon name="x" size={11} />
                  Reset Filter Wilayah
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                alignItems: 'flex-end',
              }}
            >
              {/* Filter Kecamatan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Kecamatan
                </label>
                <select
                  value={kecamatan}
                  onChange={(e) => {
                    setKecamatan(e.target.value);
                    setKelurahan('Semua kelurahan');
                    setJalan('Semua jalan');
                  }}
                  aria-label="Filter Kecamatan"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#0f172a',
                    outline: 'none',
                    height: '32px',
                    cursor: 'pointer',
                  }}
                >
                  <option>Semua kecamatan</option>
                  {availableKecamatans.map((k) => (
                    <option key={k} value={k}>
                      Kec. {k}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Kelurahan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Kelurahan
                </label>
                <select
                  value={kelurahan}
                  onChange={(e) => {
                    setKelurahan(e.target.value);
                    setJalan('Semua jalan');
                  }}
                  aria-label="Filter Kelurahan"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#0f172a',
                    outline: 'none',
                    height: '32px',
                    cursor: 'pointer',
                  }}
                >
                  <option>Semua kelurahan</option>
                  {availableKelurahans.map((kl) => (
                    <option key={kl} value={kl}>
                      Kel. {kl}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Jalan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Jalan / Alamat Spesifik
                </label>
                <select
                  value={jalan}
                  onChange={(e) => setJalan(e.target.value)}
                  aria-label="Filter Jalan"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#0f172a',
                    outline: 'none',
                    height: '32px',
                    cursor: 'pointer',
                  }}
                >
                  <option>Semua jalan</option>
                  {availableJalans.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Active Wilayah Filter Badges */}
        {activeWilayahCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              marginBottom: '14px',
              padding: '6px 10px',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              fontSize: '11.5px',
            }}
          >
            <span style={{ color: '#0369a1', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Icon name="filter" size={12} />
              Filter Wilayah:
            </span>

            {kecamatan !== 'Semua kecamatan' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#ffffff',
                  border: '1px solid #7dd3fc',
                  color: '#0369a1',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                Kecamatan: <b>{kecamatan}</b>
                <button
                  type="button"
                  onClick={() => setKecamatan('Semua kecamatan')}
                  aria-label="Hapus filter kecamatan"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#0369a1', display: 'flex' }}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}

            {kelurahan !== 'Semua kelurahan' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#ffffff',
                  border: '1px solid #7dd3fc',
                  color: '#0369a1',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                Kelurahan: <b>{kelurahan}</b>
                <button
                  type="button"
                  onClick={() => setKelurahan('Semua kelurahan')}
                  aria-label="Hapus filter kelurahan"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#0369a1', display: 'flex' }}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}

            {jalan !== 'Semua jalan' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#ffffff',
                  border: '1px solid #7dd3fc',
                  color: '#0369a1',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontWeight: 500,
                }}
              >
                Jalan: <b>{jalan}</b>
                <button
                  type="button"
                  onClick={() => setJalan('Semua jalan')}
                  aria-label="Hapus filter jalan"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#0369a1', display: 'flex' }}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetWilayahFilters}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 500,
                marginLeft: 'auto',
                textDecoration: 'underline',
              }}
            >
              Hapus semua filter wilayah
            </button>
          </div>
        )}

        {/* High-Agency Enterprise Data Table */}
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Pelanggan &amp; Nomor SIA</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Alamat Instalasi</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Cluster</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Splitter &amp; Port</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status Layanan</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Redaman Terakhir</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {displayedCustomers.map((c) => (
                  <tr
                    key={c.siaNumber}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedCustomer(c)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
                        {c.fullName}
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            color: '#0e5b92',
                          }}
                        >
                          {c.siaNumber}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', color: '#475569', maxWidth: '300px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} title={c.address}>
                        <span style={{ fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.street || c.address.split(',')[0]}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Icon name="pin" size={11} />
                          {c.kelurahan && c.kecamatan
                            ? `Kel. ${c.kelurahan}, Kec. ${c.kecamatan}`
                            : c.address}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontWeight: 500, color: '#334155' }}>{c.cluster}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>{c.clusterCode}</span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.splitterCode}</div>
                      <div style={{ fontSize: '11px', color: '#0e5b92', fontFamily: 'monospace' }}>
                        Port #{c.portNumber}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span className="customer-status-badge">
                        <span
                          className={`customer-status-dot ${
                            c.status === 'ACTIVE'
                              ? 'active'
                              : c.status === 'PENDING_INSTALL'
                              ? 'pending'
                              : c.status === 'ISOLATED'
                              ? 'isolated'
                              : 'inactive'
                          }`}
                        />
                        <span>
                          {c.status === 'ACTIVE'
                            ? 'Aktif'
                            : c.status === 'PENDING_INSTALL'
                            ? 'Menunggu PSB'
                            : c.status === 'ISOLATED'
                            ? 'Terisolir'
                            : 'Nonaktif'}
                        </span>
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: '12.5px', color: '#0f172a' }}>
                        <span>{c.currentAttenuation.toFixed(1)} dBm</span>
                        <SignalStrengthBars
                          status={
                            c.currentAttenuation >= -22.0 && c.currentAttenuation <= -15.0
                              ? 'normal'
                              : c.currentAttenuation < -22.0 && c.currentAttenuation >= -25.0
                              ? 'warning'
                              : 'critical'
                          }
                        />
                      </div>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                        {c.currentAttenuation >= -22.0 && c.currentAttenuation <= -15.0
                          ? 'Normal'
                          : c.currentAttenuation < -22.0 && c.currentAttenuation >= -25.0
                          ? 'Waspada'
                          : 'Kritis'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(c);
                        }}
                        style={{
                          padding: '5px 10px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#334155',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Detail SIA
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {displayedCustomers.length === 0 && (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '13px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px dashed #cbd5e1',
                margin: '16px 0',
              }}
            >
              Data pelanggan tidak ditemukan untuk filter ini.
            </div>
          )}
        </div>
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
