'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { classifyDbm, dbmTone } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { CustomerDetailModal } from '@/components/modals/CustomerDetailModal';
import type { CustomerListItem } from '@/services/customer.service';

type CustomerStatusTab = 'all' | 'ACTIVE' | 'PENDING_INSTALL' | 'critical' | 'ISOLATED';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [statusTab, setStatusTab] = useState<CustomerStatusTab>('all');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);

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

  // Filtered by Cluster and Search
  const clusterScoped = useMemo(() => {
    return customers.filter((c) => {
      const matchesCluster =
        cluster === 'Semua cluster' ||
        c.cluster.toLowerCase().includes(cluster.toLowerCase().replace('bandung ', ''));
      const matchesSearch =
        search === '' ||
        c.fullName.toLowerCase().includes(search.toLowerCase()) ||
        c.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
        c.address.toLowerCase().includes(search.toLowerCase()) ||
        c.splitterCode.toLowerCase().includes(search.toLowerCase()) ||
        c.cluster.toLowerCase().includes(search.toLowerCase());
      return matchesCluster && matchesSearch;
    });
  }, [customers, cluster, search]);

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
              aria-label="Cari pelanggan"
              placeholder="Cari nama, nomor SIA, ODP, atau alamat..."
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

          {/* Right: Cluster Dropdown + Segmented Filter Tabs */}
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
                onClick={() => setStatusTab('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: statusTab === 'all' ? 600 : 500,
                  background: statusTab === 'all' ? '#ffffff' : 'transparent',
                  color: statusTab === 'all' ? '#0f172a' : '#64748b',
                  boxShadow: statusTab === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Semua ({clusterScoped.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('ACTIVE')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: statusTab === 'ACTIVE' ? 600 : 500,
                  background: statusTab === 'ACTIVE' ? '#ffffff' : 'transparent',
                  color: statusTab === 'ACTIVE' ? '#0f172a' : '#64748b',
                  boxShadow: statusTab === 'ACTIVE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Aktif ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('PENDING_INSTALL')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: statusTab === 'PENDING_INSTALL' ? 600 : 500,
                  background: statusTab === 'PENDING_INSTALL' ? '#ffffff' : 'transparent',
                  color: statusTab === 'PENDING_INSTALL' ? '#0f172a' : '#64748b',
                  boxShadow: statusTab === 'PENDING_INSTALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Pending PSB ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('critical')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: statusTab === 'critical' ? 600 : 500,
                  background: statusTab === 'critical' ? '#ffffff' : 'transparent',
                  color: statusTab === 'critical' ? '#0f172a' : '#64748b',
                  boxShadow: statusTab === 'critical' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Kritis ({criticalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('ISOLATED')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: statusTab === 'ISOLATED' ? 600 : 500,
                  background: statusTab === 'ISOLATED' ? '#ffffff' : 'transparent',
                  color: statusTab === 'ISOLATED' ? '#0f172a' : '#64748b',
                  boxShadow: statusTab === 'ISOLATED' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Terisolir ({isolatedCount})
              </button>
            </div>
          </div>
        </div>

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
              {displayedCustomers.map((c) => {
                const tone = dbmTone(c.currentAttenuation);
                return (
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

                    <td style={{ padding: '12px 14px', color: '#475569', maxWidth: '280px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.address}>
                        {c.address}
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
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background:
                            c.status === 'ACTIVE'
                              ? '#f0fdf4'
                              : c.status === 'PENDING_INSTALL'
                              ? '#fffbeb'
                              : '#fef2f2',
                          border: `1px solid ${
                            c.status === 'ACTIVE'
                              ? '#bbf7d0'
                              : c.status === 'PENDING_INSTALL'
                              ? '#fde68a'
                              : '#fecaca'
                          }`,
                          color:
                            c.status === 'ACTIVE'
                              ? '#166534'
                              : c.status === 'PENDING_INSTALL'
                              ? '#92400e'
                              : '#991b1b',
                        }}
                      >
                        {c.status === 'ACTIVE' && (
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
                        )}
                        {c.status}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '12.5px',
                          color:
                            tone === 'green'
                              ? '#166534'
                              : tone === 'orange'
                              ? '#b45309'
                              : '#be123c',
                        }}
                      >
                        {c.currentAttenuation.toFixed(1)} dBm
                      </div>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                        {classifyDbm(c.currentAttenuation)}
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
                );
              })}
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
