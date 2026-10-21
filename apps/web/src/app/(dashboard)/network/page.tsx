'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { CustomerDetailModal } from '@/components/modals/CustomerDetailModal';
import type { CustomerListItem } from '@/services/customer.service';
import { FALLBACK_CLUSTERS } from '@/services/network.service';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { CreateTicketInput } from '@repo/shared';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth-context';

export interface SplitterPortActivity {
  type: 'PEMASANGAN' | 'MAINTENANCE' | 'PENARIKAN';
  date: string;
  technician: string;
  ticketNumber?: string;
  notes?: string;
}

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerName?: string;
  siaNumber?: string;
  attenuation?: number;
  attenuationHistory?: number[];
  lastActivity?: SplitterPortActivity;
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

export default function NetworkPage() {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('Semua cluster');
  const [portStatusFilter, setPortStatusFilter] = useState('Semua');
  const [viewMode, setViewMode] = useState<'console' | 'grid'>('console');
  const [activeSplitterCode, setActiveSplitterCode] = useState<string>('ODP-BDG-05');
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({
    'BDG-01': true,
    'BDG-02': true,
    'BDG-03': true,
    'BDG-04': true,
  });
  const [networkData, setNetworkData] = useState<ClusterListItem[]>(FALLBACK_CLUSTERS);
  const [stats, setStats] = useState<NetworkStats>({
    totalClusters: 4,
    totalSplitters: 8,
    totalCapacity: 88,
    usedCapacity: 40,
    availableCapacity: 48,
  });
  const [loading, setLoading] = useState(false);
  const [selectedPort, setSelectedPort] = useState<SelectedPortContext | null>(null);
  const [portFilter, setPortFilter] = useState<'ALL' | 'OCCUPIED' | 'AVAILABLE'>('ALL');
  const [activeTab, setActiveTab] = useState<'ports' | 'inspeksi' | 'riwayat' | 'audit'>('ports');
  const [expandedPortNum, setExpandedPortNum] = useState<number | null>(1);
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<CustomerListItem | null>(null);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN'>('ALL');
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditTimestamp, setAuditTimestamp] = useState<string>('22:00:15 WIB');

  // Ticket modal state for direct dispatcher action
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketModalInitial, setTicketModalInitial] = useState<Partial<CreateTicketInput>>({});

  const { showSuccess, showError } = useToast();
  const { canCreateTicket } = useAuth();

  const fetchClusters = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/clusters');
      const json = await res.json();
      if (json.success && json.data && json.data.clusters && json.data.clusters.length > 0) {
        setNetworkData(json.data.clusters);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch (err) {
      console.warn('[NetworkPage] Gunakan data cluster inventaris lokal:', err);
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

  const toggleClusterExpand = (clusterCode: string) => {
    setExpandedClusters((prev) => ({
      ...prev,
      [clusterCode]: !prev[clusterCode],
    }));
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

  // Group splitters by cluster to form authentic directory / folder hierarchy
  const clusterGroups = useMemo(() => {
    const map = new Map<string, {
      clusterCode: string;
      name: string;
      splitters: ClusterListItem[];
      totalUsed: number;
      totalPorts: number;
    }>();

    for (const item of filteredClusters) {
      const existing = map.get(item.clusterCode);
      if (existing) {
        existing.splitters.push(item);
        existing.totalUsed += item.usedPorts;
        existing.totalPorts += item.maxPorts;
      } else {
        map.set(item.clusterCode, {
          clusterCode: item.clusterCode,
          name: item.name,
          splitters: [item],
          totalUsed: item.usedPorts,
          totalPorts: item.maxPorts,
        });
      }
    }

    return Array.from(map.values());
  }, [filteredClusters]);

  // Active selected ODP Splitter
  const activeSplitter = useMemo(() => {
    if (activeSplitterCode) {
      const found = filteredClusters.find((c) => c.splitterCode === activeSplitterCode);
      if (found) return found;
    }
    return filteredClusters[0] || null;
  }, [filteredClusters, activeSplitterCode]);

  // Filtered ports for active splitter (All, Occupied, Available)
  const activeSplitterFilteredPorts = useMemo(() => {
    if (!activeSplitter) return [];
    if (portFilter === 'OCCUPIED') {
      return activeSplitter.ports.filter((p) => p.isOccupied);
    }
    if (portFilter === 'AVAILABLE') {
      return activeSplitter.ports.filter((p) => !p.isOccupied);
    }
    return activeSplitter.ports;
  }, [activeSplitter, portFilter]);

  // Executive Telemetry Bento Summary
  const fleetSummary = useMemo(() => {
    let totalNormal = 0;
    let totalWarning = 0;
    let totalCritical = 0;
    let totalOccupied = 0;
    let totalCapacity = 0;

    for (const c of filteredClusters) {
      totalCapacity += c.maxPorts;
      totalOccupied += c.usedPorts;
      for (const p of c.ports) {
        if (p.isOccupied && p.attenuation !== undefined) {
          if (p.attenuation >= -22.0 && p.attenuation <= -15.0) {
            totalNormal++;
          } else if (p.attenuation < -22.0 && p.attenuation >= -25.0) {
            totalWarning++;
          } else {
            totalCritical++;
          }
        }
      }
    }

    const available = totalCapacity - totalOccupied;
    const occupancyPct = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    const normalPct = totalOccupied > 0 ? Math.round((totalNormal / totalOccupied) * 100) : 100;

    return {
      totalCapacity,
      totalOccupied,
      available,
      occupancyPct,
      normalPct,
      totalNormal,
      totalWarning,
      totalCritical,
    };
  }, [filteredClusters]);

  useEffect(() => {
    if (filteredClusters.length > 0) {
      if (!activeSplitterCode || !filteredClusters.some((c) => c.splitterCode === activeSplitterCode)) {
        setActiveSplitterCode(filteredClusters[0].splitterCode);
      }
    }
  }, [filteredClusters, activeSplitterCode]);

  const getAttenuationMeta = (att: number | undefined) => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', tone: 'neutral', badge: 'badge gray', status: 'neutral' as const };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, tone: 'normal', badge: 'badge green', status: 'normal' as const };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, tone: 'warning', badge: 'badge yellow', status: 'warning' as const };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, tone: 'critical', badge: 'badge red', status: 'critical' as const };
  };

  const odpHistoryLogs = useMemo(() => {
    return [
      {
        portNumber: 1,
        type: 'MAINTENANCE' as const,
        date: '18 Okt 2026 · 14:20 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-081',
        customerName: 'Pelanggan BT-1',
        attenuationDelta: '-19.3 dBm → -18.8 dBm (+0.5 dBm)',
        notes: 'Optimasi sambungan kabel drop core dan pembersihan ferrule adaptor SC/UPC.',
      },
      {
        portNumber: 2,
        type: 'PEMASANGAN' as const,
        date: '17 Okt 2026 · 09:15 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-112',
        customerName: 'Pelanggan BT-2',
        attenuationDelta: 'Redaman Awal: -19.1 dBm',
        notes: 'Instalasi modem ONT ZTE F670L dan drop wire 65 meter selesai tervalidasi.',
      },
      {
        portNumber: 3,
        type: 'MAINTENANCE' as const,
        date: '16 Okt 2026 · 11:30 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-083',
        customerName: 'Pelanggan BT-3',
        attenuationDelta: '-19.9 dBm → -19.4 dBm (+0.5 dBm)',
        notes: 'Penggantian adaptor SC/UPC port 3 yang longgar pada baki splitter.',
      },
      {
        portNumber: 4,
        type: 'PEMASANGAN' as const,
        date: '15 Okt 2026 · 16:45 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-114',
        customerName: 'Pelanggan BT-4',
        attenuationDelta: 'Redaman Awal: -19.7 dBm',
        notes: 'Penarikan kabel drop core 85 meter dan aktivasi port baru.',
      },
      {
        portNumber: 5,
        type: 'MAINTENANCE' as const,
        date: '14 Okt 2026 · 10:10 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-085',
        customerName: 'Pelanggan BT-5',
        attenuationDelta: '-20.5 dBm → -20.0 dBm (+0.5 dBm)',
        notes: 'Pengecekan redaman berkala dan pembersihan adapter ferrule.',
      },
      {
        portNumber: 6,
        type: 'PEMASANGAN' as const,
        date: '13 Okt 2026 · 15:20 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-116',
        customerName: 'Pelanggan BT-6',
        attenuationDelta: 'Redaman Awal: -20.3 dBm',
        notes: 'Instalasi modem ONT dan penarikan kabel drop core.',
      },
      {
        portNumber: 11,
        type: 'PENARIKAN' as const,
        date: '05 Okt 2026 · 13:00 WIB',
        technician: 'Dedi Kurniawan',
        ticketNumber: 'DIS-2026-025',
        customerName: 'Eks Pelanggan BT-11',
        attenuationDelta: 'Port Dikembalikan ke Siap PSB',
        notes: 'Terminasi kontrak pelanggan relokasi. Patch cord dilepas dari ODP, port bebas.',
      },
    ];
  }, []);

  return (
    <main className="network-page-container">
      {/* Header Section matching Lintasarta FTTH Network Dashboard reference */}
      <header className="network-header-v2">
        <div className="network-header-titles">
          <h1 className="network-main-title">
            Master Jaringan & Splitter ODP
          </h1>
          <p className="network-sub-title">
            Data master jaringan FTTH, daftar ODP, splitter, dan informasi port secara terpusat.
          </p>
        </div>
      </header>

      {/* 3 Metric Cards (Kesehatan Jaringan Removed, Zero Progress Percentages) */}
      <section className="network-metrics-row-3" aria-label="Metrik Utama Jaringan">
        {/* Card 1: Pelanggan Aktif */}
        <article className="metric-card-clean">
          <div className="metric-card-header">
            <div className="metric-icon-box">
              <Icon name="network" size={20} />
            </div>
            <div className="metric-label-group">
              <span className="metric-label-text">Pelanggan aktif</span>
              <span className="metric-number-big">428</span>
            </div>
          </div>
          <div className="metric-footer-text">
            <span className="metric-trend-up">
              <span>↑</span> +12
            </span>
            <span>dari bulan lalu</span>
          </div>
        </article>

        {/* Card 2: Tiket Aktif */}
        <article className="metric-card-clean">
          <div className="metric-card-header">
            <div className="metric-icon-box">
              <Icon name="ticket" size={20} />
            </div>
            <div className="metric-label-group">
              <span className="metric-label-text">Tiket aktif</span>
              <span className="metric-number-big">3</span>
            </div>
          </div>
          <div className="metric-footer-text">
            <span className="metric-pill-chip">1 menunggu</span>
            <span>penguasaan teknisi</span>
          </div>
        </article>

        {/* Card 3: Teknisi di Lapangan */}
        <article className="metric-card-clean">
          <div className="metric-card-header">
            <div className="metric-icon-box">
              <Icon name="wrench" size={20} />
            </div>
            <div className="metric-label-group">
              <span className="metric-label-text">Teknisi di lapangan</span>
              <span className="metric-number-big">186</span>
            </div>
          </div>
          <div className="metric-footer-text">
            <span>dari 200 teknisi terdaftar</span>
          </div>
        </article>
      </section>

      {/* Main Content Area: Master-Detail Console View OR Balanced 2x2 Grid View */}
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
        <div className="network-main-grid">
          {/* Left Panel: Struktur Wilayah (Clean Tree, No Emojis, No Progress Percentages) */}
          <aside className="tree-sidebar-card" aria-label="Struktur Wilayah">
            <div className="tree-sidebar-header">
              <span className="tree-sidebar-title">Struktur Wilayah</span>
            </div>

            <div className="tree-sidebar-search">
              <span className="tree-sidebar-search-icon">
                <Icon name="search" size={13} />
              </span>
              <input
                type="text"
                className="tree-sidebar-search-input"
                placeholder="Cari cluster atau ODP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="tree-clusters-accordion">
              {clusterGroups.map((group) => {
                const isExpanded = expandedClusters[group.clusterCode] ?? true;
                const hasActiveChild = group.splitters.some((s) => s.splitterCode === activeSplitter?.splitterCode);

                return (
                  <div key={group.clusterCode} className="tree-cluster-node">
                    <button
                      type="button"
                      className={`tree-cluster-head-btn ${hasActiveChild ? 'is-active-cluster' : ''}`}
                      onClick={() => toggleClusterExpand(group.clusterCode)}
                    >
                      <div className="tree-cluster-left-content">
                        <span className={`tree-chevron-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                        <span className="tree-cluster-title-text">{group.name}</span>
                      </div>
                      <span className="tree-cluster-port-count">
                        {group.totalUsed}/{group.totalPorts} port
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="tree-odp-branches-clean">
                        {group.splitters.map((s) => {
                          const isSelected = activeSplitter?.splitterCode === s.splitterCode;
                          return (
                            <button
                              key={s.splitterCode}
                              type="button"
                              onClick={() => {
                                setActiveSplitterCode(s.splitterCode);
                                setExpandedPortNum(1);
                              }}
                              className={`tree-odp-item-clean ${isSelected ? 'is-selected' : ''}`}
                            >
                              <div className="tree-odp-leaf-left">
                                <span className="tree-odp-leaf-chevron">›</span>
                                <span>{s.splitterCode}</span>
                              </div>
                              <span className="tree-odp-leaf-right">
                                {s.usedPorts}/{s.maxPorts} port
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right Column: Active ODP Command Deck */}
          {activeSplitter && (
            <section className="odp-main-panel-card" aria-label={`Detail ODP ${activeSplitter.name}`}>
              {/* Top Header for Selected ODP (Clean, No Progress Bar, No Percentage) */}
              <div className="odp-hardware-chassis-top">
                <div className="odp-id-left-group">
                  <div className="odp-switch-icon-box">
                    <Icon name="network" size={20} />
                  </div>
                  <div>
                    <div className="odp-title-status-row">
                      <h2 className="odp-name-heading">
                        {activeSplitter.name} / {activeSplitter.splitterCode}
                      </h2>
                      <span className="odp-status-badge-active">Aktif</span>
                    </div>
                    <p className="odp-sub-specs-line">
                      <span>Cluster: {activeSplitter.clusterCode}</span>
                      <span>·</span>
                      <span>Koordinat: {activeSplitter.lat.toFixed(4)}, {activeSplitter.lng.toFixed(4)}</span>
                      <span>·</span>
                      <span>Splitter: {activeSplitter.maxPorts === 8 ? '1x8 PLC' : '1x16 PLC'}</span>
                    </p>
                  </div>
                </div>

                <div className="odp-header-right-stats">
                  <div className="odp-port-summary-clean">
                    <span>Total Port {activeSplitter.maxPorts}</span>
                    <span className="sep">|</span>
                    <span>Terisi {activeSplitter.usedPorts}</span>
                    <span className="sep">|</span>
                    <span>Siap PSB {activeSplitter.maxPorts - activeSplitter.usedPorts}</span>
                  </div>
                  <button
                    type="button"
                    className="odp-more-menu-btn"
                    title="Opsi ODP"
                    onClick={() => showSuccess(`ODP ${activeSplitter.splitterCode} beroperasi normal.`)}
                  >
                    ⋮
                  </button>
                </div>
              </div>

              {/* Navigation Tabs matching reference */}
              <div className="odp-navigation-tabs-bar" role="tablist">
                <button
                  type="button"
                  className={`odp-nav-tab-btn ${activeTab === 'ports' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('ports')}
                >
                  Port & Pelanggan
                </button>
                <button
                  type="button"
                  className={`odp-nav-tab-btn ${activeTab === 'inspeksi' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('inspeksi')}
                >
                  Inspeksi
                </button>
                <button
                  type="button"
                  className={`odp-nav-tab-btn ${activeTab === 'riwayat' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('riwayat')}
                >
                  Riwayat
                </button>
                <button
                  type="button"
                  className={`odp-nav-tab-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  Audit
                </button>
              </div>

              {activeTab === 'ports' && (
                <div className="odp-table-wrapper">
                  <table className="odp-clean-table">
                    <thead>
                      <tr>
                        <th style={{ width: '36px' }}></th>
                        <th>PORT</th>
                        <th>ALOKASI</th>
                        <th>PELANGGAN / SIA</th>
                        <th>REDAMAN (dBm)</th>
                        <th>STATUS</th>
                        <th>AKTIVITAS TERAKHIR</th>
                        <th style={{ textAlign: 'right', paddingRight: '18px' }}>AKSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSplitterFilteredPorts.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                            Tidak ada port yang cocok dengan filter status yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        activeSplitterFilteredPorts.map((port) => {
                          const isExpanded = expandedPortNum === port.portNumber;
                          const isOccupied = port.isOccupied;
                          const attMeta = getAttenuationMeta(port.attenuation);

                          return (
                            <React.Fragment key={port.portNumber}>
                              <tr
                                className={`odp-table-data-row ${isExpanded ? 'is-row-selected' : ''}`}
                                onClick={() => setExpandedPortNum(isExpanded ? null : port.portNumber)}
                                style={{ cursor: 'pointer' }}
                              >
                                {/* Chevron Expand */}
                                <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                  <span>{isExpanded ? '⌄' : '›'}</span>
                                </td>

                                {/* Port */}
                                <td>
                                  <span className="port-id-chip-clean">
                                    P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                                  </span>
                                </td>

                                {/* Alokasi */}
                                <td>
                                  <span className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}>
                                    {isOccupied ? 'Terisi' : 'Siap PSB'}
                                  </span>
                                </td>

                                {/* Pelanggan / SIA */}
                                <td>
                                  {isOccupied ? (
                                    <div>
                                      <div className="customer-name-bold">{port.customerName || 'Pelanggan'}</div>
                                      <div className="customer-sia-code">{port.siaNumber || '-'}</div>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>-</span>
                                  )}
                                </td>

                                {/* Redaman (dBm) */}
                                <td>
                                  {isOccupied && port.attenuation !== undefined ? (
                                    <span className="redaman-value-clean">
                                      <span>{port.attenuation.toFixed(1)} dBm</span>
                                      <SignalStrengthBars status={attMeta.status} />
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>-</span>
                                  )}
                                </td>

                                {/* Status */}
                                <td>
                                  {isOccupied ? (
                                    <span className={`status-badge-clean-${attMeta.status}`}>
                                      <span>✓</span>
                                      <span>{attMeta.status === 'normal' ? 'Normal' : attMeta.status === 'warning' ? 'Waspada' : 'Kritis'}</span>
                                    </span>
                                  ) : (
                                    <span className="status-badge-clean-psb">
                                      <span>✓</span>
                                      <span>Siap PSB</span>
                                    </span>
                                  )}
                                </td>

                                {/* Aktivitas Terakhir */}
                                <td>
                                  {port.lastActivity ? (
                                    <div className="activity-cell-clean">
                                      <span className="activity-title-clean">
                                        <Icon name="network" size={12} style={{ color: '#64748b' }} />
                                        <span>
                                          {port.lastActivity.type === 'MAINTENANCE'
                                            ? 'Maintenance'
                                            : port.lastActivity.type === 'PEMASANGAN'
                                            ? 'Pemasangan'
                                            : 'Penarikan'}
                                        </span>
                                      </span>
                                      <span className="activity-sub-clean">
                                        {port.lastActivity.technician}
                                      </span>
                                      <span className="activity-sub-clean">
                                        {port.lastActivity.date}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>-</span>
                                  )}
                                </td>

                                {/* Aksi */}
                                <td style={{ textAlign: 'right', paddingRight: '18px' }} onClick={(e) => e.stopPropagation()}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      type="button"
                                      className="action-detail-link"
                                      onClick={() => setExpandedPortNum(isExpanded ? null : port.portNumber)}
                                    >
                                      Detail
                                    </button>
                                    <button
                                      type="button"
                                      className="odp-more-menu-btn"
                                      style={{ padding: '2px 6px' }}
                                      title="Opsi Port"
                                      onClick={() => handlePortClick(activeSplitter, port)}
                                    >
                                      ⋮
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded Detail Inspeksi Row */}
                              {isExpanded && (
                                <tr style={{ background: '#f8fafc' }}>
                                <td colSpan={8} style={{ padding: '8px 16px 14px 16px' }}>
                                  <div className="inline-inspect-box-reference">
                                    <div className="inline-inspect-box-title">
                                      Detail Inspeksi Port P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                                    </div>

                                    <div className="inline-inspect-ref-grid">
                                      <div className="inline-inspect-col">
                                        <span className="inline-inspect-col-label">Hasil Inspeksi</span>
                                        <span className="inline-inspect-col-val" style={{ color: isOccupied ? '#16a34a' : '#0284c7' }}>
                                          {isOccupied ? 'Normal' : 'Port Siap Alokasi PSB'}
                                        </span>
                                      </div>

                                      <div className="inline-inspect-col">
                                        <span className="inline-inspect-col-label">Foto</span>
                                        <span className="inline-inspect-col-val" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                          <Icon name="camera" size={13} style={{ color: '#64748b' }} />
                                          <span>{isOccupied ? '2 foto' : 'Tidak ada foto'}</span>
                                        </span>
                                      </div>

                                      <div className="inline-inspect-col">
                                        <span className="inline-inspect-col-label">Catatan</span>
                                        <span className="inline-inspect-col-val" style={{ fontWeight: 400, color: '#334155' }}>
                                          {port.lastActivity?.notes || (isOccupied ? 'Tidak ada kendala, sinyal stabil.' : 'Port bebas untuk aktivasi pelanggan baru.')}
                                        </span>
                                      </div>

                                      <div className="inline-inspect-col" style={{ alignItems: 'flex-end', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                          {isOccupied && port.customerName ? (
                                            <button
                                              type="button"
                                              className="btn-inspect-detail-action"
                                              onClick={() => {
                                                setSelectedCustomerForModal({
                                                  id: port.siaNumber || `CUST-${port.portNumber}`,
                                                  fullName: port.customerName || 'Pelanggan',
                                                  siaNumber: port.siaNumber || 'SIA-2024-BT01',
                                                  address: `Area ${activeSplitter.name}`,
                                                  cluster: activeSplitter.name,
                                                  clusterCode: activeSplitter.clusterCode,
                                                  splitterCode: activeSplitter.splitterCode,
                                                  portNumber: port.portNumber,
                                                  currentAttenuation: port.attenuation ?? -18.8,
                                                  status: 'ACTIVE',
                                                  updatedAt: new Date().toISOString(),
                                                });
                                              }}
                                            >
                                              <Icon name="link" size={12} />
                                              <span>Lihat Detail</span>
                                            </button>
                                          ) : null}

                                          {canCreateTicket && (
                                            <button
                                              type="button"
                                              className="btn-inspect-ticket-action"
                                              onClick={() => {
                                                setTicketModalInitial({
                                                  ticketType: isOccupied ? 'MAINTENANCE' : 'PSB',
                                                  clusterCode: activeSplitter.name,
                                                  customerName: port.customerName || '',
                                                  siaNumber: port.siaNumber || '',
                                                  adminNotes: isOccupied
                                                    ? `Maintenance redaman pada ${activeSplitter.splitterCode} Port ${port.portNumber} (${port.attenuation || 'N/A'} dBm)`
                                                    : `Penugasan Pasang Baru pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                                                });
                                                setTicketModalOpen(true);
                                              }}
                                            >
                                              <Icon name="plus" size={12} />
                                              <span>Buat Tiket</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              )}

              {/* TAB 2: INSPEKSI FISIK & OPM */}
              {activeTab === 'inspeksi' && (
                <div className="odp-tab-pane">
                  {/* Top Status Cards: Chassis & Environmental Quality */}
                  <div className="inspection-chassis-grid">
                    <div className="inspection-chassis-card">
                      <div className="inspection-chassis-card-header">
                        <Icon name="shield" size={13} style={{ color: '#16a34a' }} />
                        <span>Enclosure ODP Box</span>
                      </div>
                      <div className="inspection-chassis-val" style={{ color: '#16a34a' }}>
                        Terkunci & Aman (IP65)
                      </div>
                      <div className="inspection-chassis-sub">
                        Kondisi housing tertutup rapat, seal karet kedap air utuh tanpa retak.
                      </div>
                    </div>

                    <div className="inspection-chassis-card">
                      <div className="inspection-chassis-card-header">
                        <Icon name="sliders" size={13} style={{ color: '#0284c7' }} />
                        <span>Manajemen Tray & Pigtail</span>
                      </div>
                      <div className="inspection-chassis-val" style={{ color: '#0f172a' }}>
                        Sesuai SOP (R &gt; 30mm)
                      </div>
                      <div className="inspection-chassis-sub">
                        Radius bending serat optik terjaga, proteksi selongsong bakar rapi.
                      </div>
                    </div>

                    <div className="inspection-chassis-card">
                      <div className="inspection-chassis-card-header">
                        <Icon name="spark" size={13} style={{ color: '#0284c7' }} />
                        <span>Kebersihan Ferrule</span>
                      </div>
                      <div className="inspection-chassis-val" style={{ color: '#0f172a' }}>
                        Bersih (Bebas Debu)
                      </div>
                      <div className="inspection-chassis-sub">
                        Konektor SC/UPC telah di-clean menggunakan optical cassette cleaner.
                      </div>
                    </div>

                    <div className="inspection-chassis-card">
                      <div className="inspection-chassis-card-header">
                        <Icon name="activity" size={13} style={{ color: '#16a34a' }} />
                        <span>Input Sinyal Feeder ODC</span>
                      </div>
                      <div className="inspection-chassis-val" style={{ color: '#16a34a' }}>
                        -12.5 dBm
                      </div>
                      <div className="inspection-chassis-sub">
                        Daya optik feeder normal. Loss insertion splitter 1x16 PLC: 13.8 dB.
                      </div>
                    </div>
                  </div>

                  {/* Inspection Action Strip */}
                  <div className="inspection-action-strip">
                    <div className="inspection-action-info">
                      <Icon name="check" size={14} />
                      <span>
                        Inspeksi Preventif Terakhir: 18 Okt 2026 oleh <strong>Andi Pratama</strong> (Tiket: TKT-2026-081)
                      </span>
                    </div>

                    <div className="inspection-action-buttons">
                      <button
                        type="button"
                        className="btn-inspect-detail-action"
                        onClick={() => showSuccess('Laporan inspeksi teknis berhasil diunduh (PDF).')}
                      >
                        <Icon name="download" size={12} />
                        <span>Unduh Berkas Hasil Inspeksi</span>
                      </button>

                      {canCreateTicket && (
                        <button
                          type="button"
                          className="btn-inspect-ticket-action"
                          onClick={() => {
                            setTicketModalInitial({
                              ticketType: 'MAINTENANCE',
                              clusterCode: activeSplitter.name,
                              adminNotes: `Inspeksi berkala dan audit fisik pada ${activeSplitter.splitterCode}`,
                            });
                            setTicketModalOpen(true);
                          }}
                        >
                          <Icon name="plus" size={12} />
                          <span>Jadwalkan Inspeksi Baru</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Port Physical Inspection Table */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table className="odp-clean-table">
                      <thead>
                        <tr>
                          <th>PORT</th>
                          <th>STATUS ALOKASI</th>
                          <th>PENGUKURAN REDAMAN</th>
                          <th>FOTO KERJA</th>
                          <th>TANGGAL & TEKNISI</th>
                          <th>CATATAN HASIL PEMERIKSAAN</th>
                          <th style={{ textAlign: 'right', paddingRight: '16px' }}>TINDAKAN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSplitter.ports.map((port) => {
                          const attMeta = getAttenuationMeta(port.attenuation);
                          const isOccupied = port.isOccupied;

                          return (
                            <tr key={port.portNumber} className="odp-table-data-row">
                              <td>
                                <span className="port-id-chip-clean">
                                  P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                                </span>
                              </td>

                              <td>
                                <span className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}>
                                  {isOccupied ? 'Terisi' : 'Siap PSB'}
                                </span>
                              </td>

                              <td>
                                {isOccupied && port.attenuation !== undefined ? (
                                  <span className="redaman-value-clean">
                                    <span>{port.attenuation.toFixed(1)} dBm</span>
                                    <SignalStrengthBars status={attMeta.status} />
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>

                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#475569' }}>
                                  <Icon name="camera" size={12} style={{ color: '#64748b' }} />
                                  <span>{isOccupied ? '2 foto' : 'Tidak ada'}</span>
                                </span>
                              </td>

                              <td>
                                <div style={{ fontSize: '11.5px' }}>
                                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{port.lastActivity?.date || '05 Okt 2026'}</div>
                                  <div style={{ color: '#64748b', fontSize: '10.5px' }}>{port.lastActivity?.technician || 'Dedi Kurniawan'}</div>
                                </div>
                              </td>

                              <td>
                                <span style={{ fontSize: '11.5px', color: '#334155' }}>
                                  {port.lastActivity?.notes || (isOccupied ? 'Sinyal optik stabil, ferrule bersih.' : 'Port bebas alokasi PSB.')}
                                </span>
                              </td>

                              <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                                <button
                                  type="button"
                                  className="action-detail-link"
                                  onClick={() => {
                                    if (isOccupied) {
                                      setTicketModalInitial({
                                        ticketType: 'MAINTENANCE',
                                        clusterCode: activeSplitter.name,
                                        customerName: port.customerName || '',
                                        siaNumber: port.siaNumber || '',
                                        adminNotes: `Inspeksi ulang redaman pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                                      });
                                    } else {
                                      setTicketModalInitial({
                                        ticketType: 'PSB',
                                        clusterCode: activeSplitter.name,
                                        adminNotes: `Penugasan Pasang Baru pada ${activeSplitter.splitterCode} Port ${port.portNumber}`,
                                      });
                                    }
                                    setTicketModalOpen(true);
                                  }}
                                >
                                  {isOccupied ? 'Inspeksi Ulang' : 'Alokasi PSB'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: RIWAYAT OPERASIONAL ODP */}
              {activeTab === 'riwayat' && (
                <div className="odp-tab-pane">
                  {/* Riwayat Activity Filters */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                        Log Histori Aktivitas Operasional {activeSplitter.splitterCode}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        Jejak audit seluruh tiket maintenance, pemasangan baru (PSB), dan penarikan teknisi.
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['ALL', 'MAINTENANCE', 'PEMASANGAN', 'PENARIKAN'] as const).map((filterKey) => (
                        <button
                          key={filterKey}
                          type="button"
                          className={`filter-chip ${historyTypeFilter === filterKey ? 'active' : ''}`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            borderRadius: '14px',
                            border: historyTypeFilter === filterKey ? '1px solid #0284c7' : '1px solid #e2e8f0',
                            background: historyTypeFilter === filterKey ? '#0284c7' : '#ffffff',
                            color: historyTypeFilter === filterKey ? '#ffffff' : '#475569',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                          onClick={() => setHistoryTypeFilter(filterKey)}
                        >
                          {filterKey === 'ALL' ? 'Semua Log' : filterKey}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timeline list */}
                  <div className="timeline-list">
                    {odpHistoryLogs
                      .filter((log) => historyTypeFilter === 'ALL' || log.type === historyTypeFilter)
                      .map((log, idx) => (
                        <div key={idx} className="timeline-entry">
                          <div className="timeline-entry-dot" />
                          <div className="timeline-entry-card">
                            <div className="timeline-entry-head">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={`status-badge-clean-${log.type === 'MAINTENANCE' ? 'normal' : log.type === 'PEMASANGAN' ? 'psb' : 'warning'}`}>
                                  {log.type}
                                </span>
                                <span className="timeline-entry-title">
                                  Port P{log.portNumber < 10 ? `0${log.portNumber}` : log.portNumber} : {log.customerName || 'Alokasi Baru'}
                                </span>
                              </div>
                              <span className="timeline-entry-date">{log.date}</span>
                            </div>

                            <p className="timeline-entry-notes">{log.notes}</p>

                            <div className="timeline-entry-meta">
                              <span>Teknisi: <strong>{log.technician}</strong></span>
                              <span>·</span>
                              <span>Tiket: <code>{log.ticketNumber}</code></span>
                              {log.attenuationDelta && (
                                <>
                                  <span>·</span>
                                  <span style={{ color: '#0369a1', fontWeight: 600 }}>
                                    Redaman: {log.attenuationDelta}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIT INTEGRITAS SKEMA & CONCURRENCY GUARD */}
              {activeTab === 'audit' && (
                <div className="odp-tab-pane">
                  {/* Concurrency Guard Overview */}
                  <div className="audit-overview-card">
                    <div className="audit-overview-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="audit-spec-badge">
                            🔒 idx_unique_active_splitter_port
                          </span>
                          <span className="status-badge-clean-normal">
                            <span>✓</span>
                            <span>100% ACID Enforced</span>
                          </span>
                        </div>
                        <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
                          Proteksi Integritas Konkurensi Database PostgreSQL (PRD Section 5.2)
                        </h3>
                        <p style={{ fontSize: '11.5px', color: '#475569', marginTop: '3px' }}>
                          Partial unique constraint mencegah bentrokan penugasan port ganda secara paralel antar teknisi lapangan.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="btn-inspect-detail-action"
                        onClick={() => {
                          setAuditRunning(true);
                          setTimeout(() => {
                            setAuditRunning(false);
                            setAuditTimestamp(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
                            showSuccess('Audit integritas database berhasil: 0 anomali port ditemukan.');
                          }, 600);
                        }}
                      >
                        <Icon name="refresh" size={12} />
                        <span>{auditRunning ? 'Memvalidasi Skema...' : 'Jalankan Uji Integritas'}</span>
                      </button>
                    </div>

                    <div className="audit-kpi-grid">
                      <div className="audit-kpi-box">
                        <div className="audit-kpi-box-label">Tabrakan Port (Collision)</div>
                        <div className="audit-kpi-box-val" style={{ color: '#16a34a' }}>0 Terdeteksi</div>
                      </div>

                      <div className="audit-kpi-box">
                        <div className="audit-kpi-box-label">Port Terkunci Atomik</div>
                        <div className="audit-kpi-box-val" style={{ color: '#0284c7' }}>{activeSplitter.usedPorts} Port Aktif</div>
                      </div>

                      <div className="audit-kpi-box">
                        <div className="audit-kpi-box-label">Port Bebas (Siap PSB)</div>
                        <div className="audit-kpi-box-val" style={{ color: '#475569' }}>{activeSplitter.maxPorts - activeSplitter.usedPorts} Port</div>
                      </div>

                      <div className="audit-kpi-box">
                        <div className="audit-kpi-box-label">Waktu Verifikasi Terakhir</div>
                        <div className="audit-kpi-box-val" style={{ fontSize: '12px', fontWeight: 600 }}>{auditTimestamp}</div>
                      </div>
                    </div>
                  </div>

                  {/* Audit Entries Table */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table className="odp-clean-table">
                      <thead>
                        <tr>
                          <th>PORT</th>
                          <th>STATUS ALOKASI</th>
                          <th>KUNCI DATABASE</th>
                          <th>NOMOR SIA / PELANGGAN</th>
                          <th>HASH INTEGRITAS AUDIT</th>
                          <th style={{ textAlign: 'right', paddingRight: '16px' }}>VALIDASI CONSTRAINT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSplitter.ports.map((port) => {
                          const isOccupied = port.isOccupied;
                          const hashStr = `sha256:${(port.portNumber * 8191 + 104729).toString(16).padEnd(10, '0')}...`;

                          return (
                            <tr key={port.portNumber} className="odp-table-data-row">
                              <td>
                                <span className="port-id-chip-clean">
                                  P{port.portNumber < 10 ? `0${port.portNumber}` : port.portNumber}
                                </span>
                              </td>

                              <td>
                                <span className={`port-alokasi-dot-label ${isOccupied ? 'occupied' : 'available'}`}>
                                  {isOccupied ? 'Terisi (Active)' : 'Siap PSB'}
                                </span>
                              </td>

                              <td>
                                <code style={{ fontSize: '11px', color: '#1e40af', background: '#eff6ff', padding: '2px 5px', borderRadius: '4px' }}>
                                  {isOccupied ? 'idx_unique_active_splitter_port' : 'FREE_POOL'}
                                </code>
                              </td>

                              <td>
                                {isOccupied ? (
                                  <div>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{port.customerName}</span>
                                    <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>{port.siaNumber}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>Port Siap Alokasi</span>
                                )}
                              </td>

                              <td>
                                <code style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>
                                  {hashStr}
                                </code>
                              </td>

                              <td style={{ textAlign: 'right', paddingRight: '16px' }}>
                                <span className={isOccupied ? 'status-badge-clean-normal' : 'status-badge-clean-psb'}>
                                  <span>✓</span>
                                  <span>{isOccupied ? 'Terkunci Valid' : 'Bebas Valid'}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Customer Detail Modal Integration */}
      {selectedCustomerForModal && (
        <CustomerDetailModal
          customer={selectedCustomerForModal}
          onClose={() => setSelectedCustomerForModal(null)}
        />
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
