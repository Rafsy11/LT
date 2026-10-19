'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { CreateTicketInput } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth-context';

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerName?: string;
  siaNumber?: string;
  attenuation?: number;
  status?: string;
}

export interface ClusterListItem {
  id: string;
  clusterCode: string;
  name: string;
  splitterCode: string;
  usedPorts: number;
  maxPorts: number;
  lat: number;
  lng: number;
  ports: SplitterPortState[];
}

export interface NetworkStats {
  totalClusters: number;
  totalSplitters: number;
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
}

interface SelectedPortContext {
  clusterCode: string;
  clusterName: string;
  splitterCode: string;
  lat: number;
  lng: number;
  port: SplitterPortState;
}

export default function NetworkPage() {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('Semua cluster');
  const [portStatusFilter, setPortStatusFilter] = useState('Semua');
  const [networkData, setNetworkData] = useState<ClusterListItem[]>([]);
  const [stats, setStats] = useState<NetworkStats>({
    totalClusters: 4,
    totalSplitters: 4,
    totalCapacity: 64,
    usedCapacity: 27,
    availableCapacity: 37,
  });
  const [loading, setLoading] = useState(true);
  const [selectedPort, setSelectedPort] = useState<SelectedPortContext | null>(null);

  // Ticket modal state for direct dispatcher action
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketModalInitial, setTicketModalInitial] = useState<Partial<CreateTicketInput>>({});

  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();

  const fetchClusters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/clusters');
      const json = await res.json();
      if (json.success && json.data) {
        setNetworkData(json.data.clusters || []);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch (err) {
      console.error('[NetworkPage] Gagal mengambil data cluster:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const handleCreateTicketSubmit = async (data: CreateTicketInput) => {
    const res = await fetch('/api/v1/admin/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      throw json.error;
    }
    // Refresh clusters immediately so port status reflects changes
    await fetchClusters();
  };

  const handlePortClick = (
    c: ClusterListItem,
    port: SplitterPortState
  ) => {
    if (
      selectedPort &&
      selectedPort.splitterCode === c.splitterCode &&
      selectedPort.port.portNumber === port.portNumber
    ) {
      setSelectedPort(null);
    } else {
      setSelectedPort({
        clusterCode: c.clusterCode,
        clusterName: c.name,
        splitterCode: c.splitterCode,
        lat: c.lat,
        lng: c.lng,
        port,
      });
    }
  };

  const openTicketModalForPort = (type: 'PSB' | 'MAINTENANCE') => {
    if (!selectedPort) return;
    if (type === 'PSB') {
      setTicketModalInitial({
        ticketType: 'PSB',
        clusterCode: selectedPort.clusterName,
        adminNotes: `Penugasan Pasang Baru pada ${selectedPort.splitterCode} Port ${selectedPort.port.portNumber}`,
      });
    } else {
      setTicketModalInitial({
        ticketType: 'MAINTENANCE',
        clusterCode: selectedPort.clusterName,
        customerName: selectedPort.port.customerName || '',
        siaNumber: selectedPort.port.siaNumber || '',
        adminNotes: `Maintenance redaman pada ${selectedPort.splitterCode} Port ${selectedPort.port.portNumber} (${selectedPort.port.attenuation || 'N/A'} dBm)`,
      });
    }
    setTicketModalOpen(true);
  };

  const filteredClusters = networkData.filter((c) => {
    const matchesCluster = clusterFilter === 'Semua cluster' || c.name.toLowerCase().includes(clusterFilter.replace('Bandung ', '').toLowerCase());
    const matchesSearch =
      search.trim() === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.clusterCode.toLowerCase().includes(search.toLowerCase()) ||
      c.splitterCode.toLowerCase().includes(search.toLowerCase()) ||
      c.ports.some(
        (p) =>
          (p.customerName && p.customerName.toLowerCase().includes(search.toLowerCase())) ||
          (p.siaNumber && p.siaNumber.toLowerCase().includes(search.toLowerCase()))
      );

    const matchesPortStatus =
      portStatusFilter === 'Semua' ||
      (portStatusFilter === 'Tersedia' && c.usedPorts < c.maxPorts) ||
      (portStatusFilter === 'Penuh' && c.usedPorts >= c.maxPorts);

    return matchesCluster && matchesSearch && matchesPortStatus;
  });

  const getAttenuationMeta = (att: number | undefined) => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', tone: 'neutral', badge: 'badge gray' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, tone: 'normal', badge: 'badge green' };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, tone: 'warning', badge: 'badge yellow' };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, tone: 'critical', badge: 'badge red' };
  };

  return (
    <main className="network-page">
      {/* Page Command Header */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">INFRASTRUKTUR & INVENTARIS AKSES FTTH</div>
          <h1 className="overview-greeting">Master Jaringan & Splitter ODP</h1>
          <p className="overview-subtitle">
            Single Source of Truth untuk cluster, splitter ODP fisik, dan port allocation matrix. Dilindungi oleh constraint anti-bentrokan database (PRD 5.2).
          </p>
        </div>

        <div className="overview-toolbar">
          <button
            className="refresh-btn"
            onClick={fetchClusters}
            type="button"
            aria-label="Segarkan data jaringan"
            title="Segarkan data jaringan"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metrics Grid matching Enterprise System */}
      <section className="network-stats-grid" aria-label="Ringkasan Kapasitas Jaringan">
        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round">
                <Icon name="network" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Total Cluster</span>
                <div className="stat-card-value">{stats.totalClusters}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Wilayah operasional aktif</span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="grid" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">ODP / Splitter Fisik</span>
                <div className="stat-card-value">{stats.totalSplitters}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Titik terminasi fiber optik</span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round neutral">
                <Icon name="activity" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Kapasitas Total Port</span>
                <div className="stat-card-value">{stats.totalCapacity}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="caption">Terdistribusi di seluruh ODP</span>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <span className="stat-card-icon-round positive">
                <Icon name="check" size={17} />
              </span>
              <div className="stat-card-text">
                <span className="stat-card-label">Port Bebas (Siap PSB)</span>
                <div className="stat-card-value" style={{ color: '#16a34a' }}>
                  {stats.availableCapacity}
                </div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="highlight-pill green-pill">Tersedia</span>
              <span className="caption">Siap aktivasi pasang baru</span>
            </div>
          </div>
        </article>
      </section>

      {/* Filter and Anti-Conflict Toolbar */}
      <section className="network-toolbar">
        <div className="network-search-group">
          <div className="network-search-input">
            <Icon name="search" size={15} />
            <input
              type="text"
              aria-label="Cari kode cluster, ODP, atau nama pelanggan"
              placeholder="Cari cluster, ODP, nomor SIA, atau nama pelanggan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="select-wrapper">
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              aria-label="Filter Wilayah Cluster"
              className="cluster-select"
            >
              <option>Semua cluster</option>
              <option>Bandung Utara</option>
              <option>Bandung Selatan</option>
              <option>Bandung Timur</option>
              <option>Bandung Barat</option>
            </select>
          </div>

          <div className="select-wrapper">
            <select
              value={portStatusFilter}
              onChange={(e) => setPortStatusFilter(e.target.value)}
              aria-label="Filter Status Port"
              className="cluster-select"
            >
              <option value="Semua">Semua status port</option>
              <option value="Tersedia">Tersedia kapasitas</option>
              <option value="Penuh">Kapasitas penuh (100%)</option>
            </select>
          </div>
        </div>

        <div className="network-integrity-pill" title="Sesuai PRD Section 5.2: PostgreSQL Partial Unique Index mencegah race condition dan duplikasi port aktif di lapangan">
          <Icon name="shield" size={13} />
          <span>Anti-Conflict Protected: idx_unique_active_splitter_port</span>
        </div>
      </section>

      {/* Splitter Cards Grid */}
      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
          Memuat data cluster dan matriks port splitter...
        </div>
      ) : filteredClusters.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', background: '#ffffff', borderRadius: '12px', border: '1px solid #dce7f0' }}>
          <p style={{ fontWeight: 600, color: '#0f172a' }}>Tidak ada splitter yang cocok dengan filter pencarian.</p>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Coba ubah kata kunci atau reset filter cluster.</p>
        </div>
      ) : (
        <div className="network-cards-grid">
          {filteredClusters.map((c) => {
            const usagePct = Math.round((c.usedPorts / c.maxPorts) * 100);
            const isSelectedHere = selectedPort && selectedPort.splitterCode === c.splitterCode;

            return (
              <article className="network-splitter-card" key={c.splitterCode}>
                {/* Header Info */}
                <div className="splitter-card-top">
                  <div className="splitter-identity">
                    <div className="splitter-icon-box">▦</div>
                    <div>
                      <h3 className="splitter-title">
                        {c.name}
                        <span className="badge blue" style={{ fontSize: '10px', padding: '2px 7px' }}>
                          {c.maxPorts === 8 ? '1x8 PLC' : '1x16 PLC'}
                        </span>
                      </h3>
                      <p className="splitter-subtitle">
                        {c.clusterCode} · <b>{c.splitterCode}</b>
                      </p>
                    </div>
                  </div>

                  <div className="splitter-coordinates" title="Titik koordinat fisik ODP di lapangan">
                    <Icon name="pin" size={12} />
                    <span>{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</span>
                  </div>
                </div>

                {/* Capacity Track */}
                <div className="splitter-capacity-section">
                  <div className="splitter-capacity-header">
                    <span>Okupansi Port Splitter</span>
                    <span>
                      <b>{c.usedPorts}</b> / {c.maxPorts} Terisi ({usagePct}%)
                    </span>
                  </div>
                  <div className="splitter-capacity-track">
                    <div
                      className={`splitter-capacity-fill ${usagePct >= 100 ? 'full' : usagePct >= 75 ? 'high' : ''}`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                </div>

                {/* Refined Splitter Ports Matrix Panel (Anti-Slop Light Theme) */}
                <div className="splitter-ports-panel">
                  <div className="splitter-panel-header">
                    <span className="splitter-panel-title">
                      <Icon name="grid" size={13} />
                      Matriks Alokasi Port ({c.maxPorts === 8 ? '1x8 PLC' : '1x16 PLC'})
                    </span>
                    <span className="splitter-panel-meta">
                      <b>{c.usedPorts}</b> Terisi · <b>{c.maxPorts - c.usedPorts}</b> Bebas
                    </span>
                  </div>

                  {/* Ports Grid */}
                  <div
                    className="ports-matrix-grid"
                    style={{
                      gridTemplateColumns: c.maxPorts === 8 ? 'repeat(8, 1fr)' : 'repeat(8, 1fr)',
                    }}
                  >
                    {c.ports.map((p) => {
                      const isPortSelected =
                        isSelectedHere && selectedPort?.port.portNumber === p.portNumber;

                      return (
                        <button
                          key={p.portNumber}
                          type="button"
                          onClick={() => handlePortClick(c, p)}
                          className={`port-tile-btn ${
                            p.isOccupied ? 'is-occupied' : 'is-available'
                          } ${isPortSelected ? 'is-selected' : ''}`}
                          title={
                            p.isOccupied
                              ? `Port ${p.portNumber}: Terisi oleh ${p.customerName || 'Aktif'} (${p.siaNumber || 'SIA Terdaftar'})`
                              : `Port ${p.portNumber}: Tersedia untuk Pasang Baru (PSB)`
                          }
                          aria-label={`Port ${p.portNumber} status ${p.isOccupied ? 'Terisi' : 'Tersedia'}`}
                        >
                          <span className="port-tile-number">
                            P{p.portNumber < 10 ? `0${p.portNumber}` : p.portNumber}
                          </span>
                          <span className="port-tile-indicator">
                            <span
                              className={`port-status-dot ${p.isOccupied ? 'active' : 'free'}`}
                            />
                          </span>
                          <span className="port-tile-sub">
                            {p.isOccupied
                              ? p.attenuation !== undefined
                                ? `${p.attenuation.toFixed(1)}`
                                : 'Terisi'
                              : 'Tersedia'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Port Legend Bar */}
                  <div className="ports-legend-bar">
                    <div className="legend-group">
                      <span className="legend-item">
                        <span className="legend-color-box occupied" />
                        <span>Terisi (SIA Aktif)</span>
                      </span>
                      <span className="legend-item">
                        <span className="legend-color-box available" />
                        <span>Tersedia (Siap PSB)</span>
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Klik port untuk inspeksi & alokasi tiket
                    </span>
                  </div>
                </div>

                {/* Interactive Port Inspector Box (When a port on this splitter is clicked) */}
                {isSelectedHere && selectedPort && (
                  <div className="port-inspector-card">
                    <div className="inspector-header">
                      <div className="inspector-title">
                        <Icon name="network" size={15} />
                        <span>
                          Inspeksi Port {selectedPort.port.portNumber} · {selectedPort.splitterCode} ({selectedPort.clusterName})
                        </span>
                      </div>
                      <button
                        className="text-button"
                        style={{ fontSize: '12px', padding: '0 4px', color: '#64748b' }}
                        onClick={() => setSelectedPort(null)}
                        aria-label="Tutup inspeksi port"
                      >
                        ✕ Tutup
                      </button>
                    </div>

                    <div className="inspector-grid">
                      {selectedPort.port.isOccupied ? (
                        <>
                          <div className="inspector-field">
                            <span className="inspector-field-label">Status Alokasi</span>
                            <span className="inspector-field-value">
                              <span className="badge blue">TERISI (ACTIVE)</span>
                            </span>
                          </div>

                          <div className="inspector-field">
                            <span className="inspector-field-label">Nama Pelanggan</span>
                            <span className="inspector-field-value">
                              {selectedPort.port.customerName || 'Pelanggan Terdaftar'}
                            </span>
                          </div>

                          <div className="inspector-field">
                            <span className="inspector-field-label">Nomor SIA</span>
                            <span className="inspector-field-value">
                              <code style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px' }}>
                                {selectedPort.port.siaNumber || 'SIA-2024-xxx'}
                              </code>
                            </span>
                          </div>

                          <div className="inspector-field">
                            <span className="inspector-field-label">Redaman Optik (OPM)</span>
                            <span className="inspector-field-value">
                              {(() => {
                                const meta = getAttenuationMeta(selectedPort.port.attenuation);
                                return <span className={meta.badge}>{meta.label}</span>;
                              })()}
                            </span>
                          </div>

                          <div className="inspector-field" style={{ gridColumn: '1 / -1' }}>
                            <span className="inspector-field-label">Integritas Database (PRD 5.2)</span>
                            <span style={{ fontSize: '11px', color: '#1e40af' }}>
                              🔒 Terkunci oleh <code>idx_unique_active_splitter_port</code>. Port ini tidak dapat ditimpa oleh instalasi baru tanpa mutasi tiket.
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="inspector-field">
                            <span className="inspector-field-label">Status Alokasi</span>
                            <span className="inspector-field-value">
                              <span className="badge green">TERSEDIA / SIAP PSB</span>
                            </span>
                          </div>

                          <div className="inspector-field">
                            <span className="inspector-field-label">Kapasitas Splitter</span>
                            <span className="inspector-field-value">
                              Port {selectedPort.port.portNumber} dari {c.maxPorts} Port
                            </span>
                          </div>

                          <div className="inspector-field" style={{ gridColumn: '1 / -1' }}>
                            <span className="inspector-field-label">Validasi Anti-Bentrokan</span>
                            <span style={{ fontSize: '11.5px', color: '#15803d' }}>
                              ✓ Port bebas dan belum terikat pelanggan aktif. Siap ditugaskan melalui Tiket Pasang Baru (PSB).
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Quick Admin Actions */}
                    <div className="inspector-actions">
                      {selectedPort.port.isOccupied ? (
                        <>
                          {canCreateTicket && (
                            <button
                              type="button"
                              className="button primary"
                              style={{ padding: '6px 12px', fontSize: '11.5px' }}
                              onClick={() => openTicketModalForPort('MAINTENANCE')}
                            >
                              <Icon name="wrench" size={13} />
                              <span>Buat Tiket Maintenance</span>
                            </button>
                          )}
                          <Link
                            href={`/tickets?search=${selectedPort.port.siaNumber || ''}`}
                            className="button secondary"
                            style={{ padding: '6px 12px', fontSize: '11.5px' }}
                          >
                            <Icon name="ticket" size={13} />
                            <span>Lihat Riwayat Tiket</span>
                          </Link>
                        </>
                      ) : (
                        <>
                          {canCreateTicket && (
                            <button
                              type="button"
                              className="button primary"
                              style={{ padding: '6px 12px', fontSize: '11.5px', background: '#16a34a', borderColor: '#16a34a' }}
                              onClick={() => openTicketModalForPort('PSB')}
                            >
                              <Icon name="plus" size={13} />
                              <span>Tugaskan Tiket PSB di Port Ini</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Integrated Ticket Dispatcher Modal */}
      <CreateTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        onSubmit={handleCreateTicketSubmit}
        initialValues={ticketModalInitial}
      />
    </main>
  );
}
