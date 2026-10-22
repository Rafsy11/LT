'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { classifyDbm, dbmTone, ATTENUATION_THRESHOLDS } from '@repo/shared';
import { Icon } from '@/components/ui/Icon';
import { TicketDetailModal } from '@/components/modals/TicketDetailModal';

export interface LiveReportItem {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: 'Pasang baru' | 'Perbaikan' | 'Maintenance' | 'Instalasi';
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Selesai' | 'Dibatalkan';
  priority?: 'Normal' | 'High' | 'Low';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  isLiveIncoming?: boolean;
}

export default function MonitoringPage() {
  const [tab, setTab] = useState<'Semua' | 'Normal' | 'Warning' | 'Critical'>('Semua');
  const [search, setSearch] = useState('');
  const [cluster, setCluster] = useState('Semua cluster');
  const [typeFilter, setTypeFilter] = useState('Semua tipe');
  const [techFilter, setTechFilter] = useState('Semua teknisi');
  const [reports, setReports] = useState<LiveReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<LiveReportItem | null>(null);
  const [modalTicket, setModalTicket] = useState<LiveReportItem | null>(null);
  const [sseState, setSseState] = useState<'CONNECTING' | 'LIVE_CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('CONNECTING');
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('Memulai koneksi...');

  const fetchInitialReports = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/tickets');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setReports(json.data);
        if (!selectedTicket && json.data.length > 0) {
          // Default to the critical item or the first item
          const crit = json.data.find((r: LiveReportItem) => classifyDbm(r.currentAttenuation) === 'Critical');
          setSelectedTicket(crit || json.data[0]);
        }
      }
    } catch (err) {
      console.error('[Monitoring] Gagal mengambil data tiket awal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialReports();

    // Setup Server-Sent Events (SSE) Stream per PRD Section 3.4 & agent.md Section 5
    let eventSource: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    let retryCount = 0;

    const connectSSE = () => {
      try {
        setSseState('CONNECTING');
        eventSource = new EventSource('/api/v1/admin/stream/reports');

        eventSource.onopen = () => {
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
          );
        };

        eventSource.addEventListener('connected', () => {
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
          );
        });

        eventSource.addEventListener('ping', () => {
          retryCount = 0;
          setSseState('LIVE_CONNECTED');
          setLastHeartbeat(
            new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
          );
        });

        eventSource.addEventListener('report', (e) => {
          try {
            const item = JSON.parse(e.data);
            const rawDbm = Number(item.attenuationDbm);
            const distance = item.distanceMeters !== undefined ? Number(item.distanceMeters) : 18;
            const isLocationFlagged = item.isLocationFlagged ?? (distance > 100);

            const newReport: LiveReportItem = {
              id: item.id || `live-${Date.now()}`,
              ticketNumber: item.ticketNumber,
              customerName: item.customerName,
              siaNumber: item.siaNumber,
              ticketType: item.type === 'Pasang baru' ? 'Pasang baru' : 'Maintenance',
              cluster: item.clusterName,
              assignedTech: item.technicianName,
              techInitials: item.techInitials || 'TK',
              status: 'Selesai',
              currentAttenuation: rawDbm,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              splitterCode: item.splitterCode || 'ODP-LIVE',
              portNumber: item.portNumber || 1,
              distanceToSplitterM: distance,
              isLocationFlagged,
              isLiveIncoming: true,
            };

            setReports((prev) => [newReport, ...prev.filter((r) => r.ticketNumber !== newReport.ticketNumber)]);
            setSelectedTicket(newReport); // Auto-focus new incoming live report in the HUD
            setLastHeartbeat(
              new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
            );
          } catch (err) {
            console.error('[Monitoring] Parse error pada SSE report event:', err);
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
          }
          retryCount++;
          // Exponential backoff: min 2s, max 30s
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
          const delaySec = Math.ceil(delayMs / 1000);
          setSseState('RECONNECTING');
          setReconnectCountdown(delaySec);

          if (countdownInterval) clearInterval(countdownInterval);
          countdownInterval = setInterval(() => {
            setReconnectCountdown((prev) => {
              if (prev <= 1) {
                if (countdownInterval) clearInterval(countdownInterval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          retryTimeout = setTimeout(() => {
            connectSSE();
          }, delayMs);
        };
      } catch (err) {
        setSseState('DISCONNECTED');
        console.error('[Monitoring] Inisialisasi EventSource gagal:', err);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, []);

  // Extract unique technician and cluster lists for filter dropdowns
  const availableClusters = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.cluster) set.add(r.cluster);
    });
    return Array.from(set).sort();
  }, [reports]);

  const availableTechs = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.assignedTech && r.assignedTech !== 'Belum Ditugaskan') set.add(r.assignedTech);
    });
    return Array.from(set).sort();
  }, [reports]);

  // Scoped reports based on toolbar filters
  const scopedReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesCluster = cluster === 'Semua cluster' || r.cluster.toLowerCase().includes(cluster.replace('Bandung ', '').toLowerCase());
      const matchesType =
        typeFilter === 'Semua tipe' ||
        (typeFilter === 'Pasang baru' && (r.ticketType === 'Pasang baru' || r.ticketType === 'Instalasi')) ||
        (typeFilter === 'Maintenance' && (r.ticketType === 'Maintenance' || r.ticketType === 'Perbaikan'));
      const matchesTech = techFilter === 'Semua teknisi' || r.assignedTech === techFilter;
      const matchesSearch =
        search.trim() === '' ||
        r.customerName.toLowerCase().includes(search.toLowerCase()) ||
        r.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.siaNumber.toLowerCase().includes(search.toLowerCase()) ||
        (r.splitterCode && r.splitterCode.toLowerCase().includes(search.toLowerCase())) ||
        r.assignedTech.toLowerCase().includes(search.toLowerCase());

      return matchesCluster && matchesType && matchesTech && matchesSearch;
    });
  }, [reports, cluster, typeFilter, techFilter, search]);

  // Tab filter: Semua, Normal, Warning, Critical
  const filteredReports = useMemo(() => {
    if (tab === 'Semua') return scopedReports;
    return scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === tab);
  }, [scopedReports, tab]);

  // Telemetry counts
  const normalCount = useMemo(() => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Normal').length, [scopedReports]);
  const warningCount = useMemo(() => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Warning').length, [scopedReports]);
  const criticalCount = useMemo(() => scopedReports.filter((r) => classifyDbm(r.currentAttenuation) === 'Critical').length, [scopedReports]);

  // Pinned Critical Alert Report (PRD 3.4)
  const pinnedCriticalReport = useMemo(() => {
    return scopedReports.find((r) => classifyDbm(r.currentAttenuation) === 'Critical') || null;
  }, [scopedReports]);

  // Active report in HUD
  const activeReport = useMemo(() => {
    if (selectedTicket) {
      const found = reports.find((r) => r.ticketNumber === selectedTicket.ticketNumber);
      if (found) return found;
    }
    return filteredReports[0] || reports[0] || null;
  }, [selectedTicket, filteredReports, reports]);

  const getMeterPercentage = (dbm: number) => {
    // Map -30 dBm to 0% and -10 dBm to 100%
    const min = -30;
    const max = -10;
    const pct = ((dbm - min) / (max - min)) * 100;
    return Math.min(Math.max(pct, 4), 98);
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Baru saja';
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    } catch {
      return 'Baru saja';
    }
  };

  return (
    <main className="monitoring-page">
      {/* Overview Command Header */}
      <div className="overview-header">
        <div className="overview-header-copy">
          <div className="eyebrow">NOC TELEMETRY & ATTENUATION STREAM</div>
          <h1 className="overview-greeting">Live Monitoring Redaman</h1>
          <p className="overview-subtitle">
            Pusat kendali dan pemantauan sinyal redaman optik FTTH secara real-time via Server-Sent Events (SSE) &amp; Redis Pub/Sub (PRD Section 3.4).
          </p>
        </div>

        <div className="overview-toolbar">
          {/* Live SSE Status Beacon */}
          <div
            className={`live-status-pill ${
              sseState === 'LIVE_CONNECTED'
                ? 'connected'
                : sseState === 'CONNECTING'
                ? 'reconnecting'
                : 'disconnected'
            }`}
            title={`Status SSE: ${sseState} · Heartbeat: ${lastHeartbeat}`}
          >
            <span className="live-pulse-beacon" />
            <span>
              {sseState === 'LIVE_CONNECTED' && 'Live SSE Active'}
              {sseState === 'CONNECTING' && 'Menghubungkan Stream...'}
              {sseState === 'RECONNECTING' && `Menghubungkan Ulang (${reconnectCountdown}s)...`}
              {sseState === 'DISCONNECTED' && 'Stream Terputus (Offline)'}
            </span>
          </div>

          <button
            className="refresh-btn"
            onClick={fetchInitialReports}
            type="button"
            aria-label="Segarkan feed laporan"
            title="Segarkan feed laporan"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* 4 Telemetry Metrics Bar (Enterprise NOC Telemetry Grid) */}
      <section className="monitoring-stats-grid" aria-label="Statistik Telemetri Redaman Optik">
        <article className="stat-card" onClick={() => setTab('Semua')}>
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <div className="stat-card-text">
                <span className="stat-card-label">Total Laporan Masuk</span>
                <div className="stat-card-value">{scopedReports.length}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="stat-card-caption">Stream aktif via Redis Pub/Sub</span>
            </div>
          </div>
        </article>

        <article className="stat-card" onClick={() => setTab('Normal')}>
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <div className="stat-card-text">
                <div className="stat-card-label-with-dot">
                  <span className="optical-status-dot normal" />
                  <span className="stat-card-label">Normal (-15 s/d -22 dBm)</span>
                </div>
                <div className="stat-card-value">{normalCount}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="stat-card-caption">Optimal · Kualitas optik standar</span>
            </div>
          </div>
        </article>

        <article className="stat-card" onClick={() => setTab('Warning')}>
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <div className="stat-card-text">
                <div className="stat-card-label-with-dot">
                  <span className="optical-status-dot warning" />
                  <span className="stat-card-label">Warning (-22.1 s/d -25 dBm)</span>
                </div>
                <div className="stat-card-value">{warningCount}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="stat-card-caption">Perlu Pantau · Potensi bending/kotor</span>
            </div>
          </div>
        </article>

        <article className="stat-card" onClick={() => setTab('Critical')}>
          <div className="stat-card-inner">
            <div className="stat-card-top">
              <div className="stat-card-text">
                <div className="stat-card-label-with-dot">
                  <span className="optical-status-dot critical" />
                  <span className="stat-card-label">Critical (&lt; -25 dBm / Drop)</span>
                </div>
                <div className="stat-card-value">{criticalCount}</div>
              </div>
            </div>
            <div className="stat-card-footer">
              <span className="stat-card-caption">Insiden Drop · Investigasi segera NOC</span>
            </div>
          </div>
        </article>
      </section>

      {/* Authoritative NOC Critical Incident Response Strip (PRD 3.4) */}
      {pinnedCriticalReport && (
        <section className="noc-incident-bar" aria-label="Notifikasi Insiden Kritis">
          <div className="noc-incident-left">
            <span className="noc-incident-badge">
              <span className="noc-incident-dot" />
              INSIDEN KRITIS
            </span>
            <div className="noc-incident-summary">
              Sinyal drop terdeteksi pada <b>{pinnedCriticalReport.customerName}</b> ({pinnedCriticalReport.siaNumber}) · {pinnedCriticalReport.splitterCode || 'ODP-CMH-02'} Port {pinnedCriticalReport.portNumber || 7} ({pinnedCriticalReport.cluster}) · Teknisi: {pinnedCriticalReport.assignedTech}
            </div>
          </div>

          <div className="noc-incident-right">
            <span className="noc-incident-dbm">{pinnedCriticalReport.currentAttenuation.toFixed(1)} dBm</span>
            <button
              className="noc-incident-btn"
              onClick={() => setSelectedTicket(pinnedCriticalReport)}
              type="button"
              title="Fokuskan inspektor HUD ke tiket ini"
            >
              <span>Investigasi Cepat</span>
              <Icon name="chevron" size={12} />
            </button>
            <button
              className="noc-incident-btn noc-incident-btn-primary"
              onClick={() => setModalTicket(pinnedCriticalReport)}
              type="button"
              title="Buka rincian tiket lengkap"
            >
              <span>Buka Tiket</span>
              <Icon name="arrow" size={12} />
            </button>
          </div>
        </section>
      )}

      {/* Master-Detail Console Layout */}
      <div className="noc-console-layout">
        {/* Left Panel: Stream Console */}
        <section className="noc-stream-panel" aria-label="Aliran Telemetri Real-Time">
          {/* Stream Toolbar */}
          <div className="noc-stream-toolbar">
            <div className="noc-toolbar-top">
              <div className="noc-search-box">
                <Icon name="search" size={14} />
                <input
                  aria-label="Cari data live stream"
                  placeholder="Cari pelanggan, nomor SIA, ODP, atau teknisi..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="noc-filters-group">
                <select
                  className="noc-select"
                  value={cluster}
                  onChange={(e) => setCluster(e.target.value)}
                  aria-label="Filter Cluster"
                >
                  <option value="Semua cluster">Semua Cluster</option>
                  <option value="Bandung Utara">Bandung Utara</option>
                  <option value="Bandung Timur">Bandung Timur</option>
                  <option value="Bandung Barat">Bandung Barat</option>
                  <option value="Bandung Selatan">Bandung Selatan</option>
                  <option value="Cimahi">Cimahi</option>
                  <option value="Rancaekek">Rancaekek</option>
                </select>

                <select
                  className="noc-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filter Tipe Tiket"
                >
                  <option value="Semua tipe">Semua Tipe Work Order</option>
                  <option value="Pasang baru">Pasang Baru (PSB)</option>
                  <option value="Maintenance">Pemeliharaan (Maintenance)</option>
                </select>

                <select
                  className="noc-select"
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value)}
                  aria-label="Filter Teknisi"
                >
                  <option value="Semua teknisi">Semua Teknisi Lapangan</option>
                  {availableTechs.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="noc-toolbar-bottom">
              <div className="noc-status-tabs">
                <button
                  className={`noc-tab-btn ${tab === 'Semua' ? 'active' : ''}`}
                  onClick={() => setTab('Semua')}
                  type="button"
                >
                  <span>Semua Sinyal</span>
                  <span className="noc-tab-count">{scopedReports.length}</span>
                </button>
                <button
                  className={`noc-tab-btn ${tab === 'Normal' ? 'active' : ''}`}
                  onClick={() => setTab('Normal')}
                  type="button"
                >
                  <span>Normal</span>
                  <span className="noc-tab-count">{normalCount}</span>
                </button>
                <button
                  className={`noc-tab-btn ${tab === 'Warning' ? 'active' : ''}`}
                  onClick={() => setTab('Warning')}
                  type="button"
                >
                  <span>Warning</span>
                  <span className="noc-tab-count">{warningCount}</span>
                </button>
                <button
                  className={`noc-tab-btn ${tab === 'Critical' ? 'active' : ''}`}
                  onClick={() => setTab('Critical')}
                  type="button"
                >
                  <span>Critical</span>
                  <span className="noc-tab-count">{criticalCount}</span>
                </button>
              </div>

              <div className="noc-stream-count-text">
                Menampilkan <b>{filteredReports.length}</b> laporan · Stream aktif
              </div>
            </div>
          </div>

          {/* Stream Table Header */}
          <div className="noc-stream-table-header">
            <div>WAKTU</div>
            <div>PELANGGAN &amp; SIA</div>
            <div>SPLITTER / PORT</div>
            <div>TEKNISI</div>
            <div>REDAMAN</div>
            <div>VALIDASI</div>
            <div style={{ textAlign: 'right' }}>AKSI</div>
          </div>

          {/* Stream Table Rows */}
          <div className="noc-stream-list">
            {loading ? (
              <div className="noc-empty-stream">Memuat aliran sinyal live telemetri...</div>
            ) : filteredReports.length === 0 ? (
              <div className="noc-empty-stream">Tidak ada laporan telemetri pada kriteria filter ini.</div>
            ) : (
              filteredReports.map((report) => {
                const status = classifyDbm(report.currentAttenuation);
                const tone = dbmTone(report.currentAttenuation);
                const meterPct = getMeterPercentage(report.currentAttenuation);
                const distance = report.distanceToSplitterM ?? 18;
                const isFlagged = report.isLocationFlagged ?? (distance > 100);
                const isSelected = activeReport?.ticketNumber === report.ticketNumber;
                const isCritical = status === 'Critical';

                return (
                  <div
                    key={report.id || report.ticketNumber}
                    className={`noc-stream-row ${isSelected ? 'active' : ''} ${isCritical ? 'critical-row' : ''}`}
                    onClick={() => setSelectedTicket(report)}
                  >
                    {/* Time & Dot Indicator */}
                    <div className="col-time-status">
                      <span className={`optical-status-dot ${status.toLowerCase()}`} title={`Status: ${status}`} />
                      <span>{formatTimestamp(report.createdAt)}</span>
                    </div>

                    {/* Customer & SIA */}
                    <div className="col-customer">
                      <div className="col-customer-name" title={report.customerName}>{report.customerName}</div>
                      <div className="col-customer-meta">
                        <code>{report.siaNumber}</code>
                        <span className="meta-separator">·</span>
                        <span className="ticket-type-label">{report.ticketType}</span>
                      </div>
                    </div>

                    {/* Network: Splitter & Port */}
                    <div className="col-network">
                      <div className="col-network-odp">
                        <span>{report.splitterCode || 'ODP-BDG-01'}</span>
                        <span className="port-tag">P{report.portNumber || 1}</span>
                      </div>
                      <div className="col-network-cluster">{report.cluster}</div>
                    </div>

                    {/* Field Technician */}
                    <div className="col-tech">
                      <span className="col-tech-avatar">{report.techInitials || 'TK'}</span>
                      <span className="col-tech-name" title={report.assignedTech}>{report.assignedTech}</span>
                    </div>

                    {/* Attenuation dBm & Spark Bar */}
                    <div className="col-signal">
                      <span className={`col-signal-value ${tone}`}>
                        {report.currentAttenuation.toFixed(1)} dBm
                      </span>
                      <div className="col-signal-bar-mini" title={`Skala Optik: ${report.currentAttenuation} dBm`}>
                        <div
                          className={`col-signal-fill-mini ${status.toLowerCase()}`}
                          style={{ width: `${meterPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Validation: Geofence & Proof */}
                    <div className="col-validation">
                      {isFlagged ? (
                        <span className="validation-tag-clean warn" title="Jarak melebihi radius batas toleransi 100 meter">
                          {distance}m Warn
                        </span>
                      ) : (
                        <span className="validation-tag-clean ok" title="GPS terverifikasi ≤ 100m dari ODP">
                          {distance}m OK
                        </span>
                      )}
                      <span className="opm-proof-check" title="Bukti OPM tersimpan di MinIO">
                        MinIO OPM
                      </span>
                    </div>

                    {/* Action Button */}
                    <div className="col-action">
                      <button
                        className="inspect-trigger-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(report);
                        }}
                        type="button"
                      >
                        {isSelected ? 'Aktif' : 'Detail'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Stream Metadata Strip */}
          <div className="monitoring-info-strip">
            <div>
              Jalur SSE: <code>/api/v1/admin/stream/reports</code> (Nginx Unbuffered <code>X-Accel-Buffering: no</code>).
            </div>
            <div>
              Heartbeat: <b>{lastHeartbeat}</b> · Redis Bus Aktif.
            </div>
          </div>
        </section>

        {/* Right Panel: Live Telemetry Inspector HUD */}
        {activeReport ? (
          <aside className="noc-inspector-panel" aria-label="Inspektor Telemetri Real-Time">
            <div className="noc-inspector-header">
              <span className="noc-inspector-title">
                INSPEKTOR TELEMETRI
              </span>
              <span className="ticket-tag-mono">{activeReport.ticketNumber}</span>
            </div>

            <div className="noc-inspector-body">
              {/* Optical HUD Gauge Card */}
              {(() => {
                const status = classifyDbm(activeReport.currentAttenuation);
                const tone = dbmTone(activeReport.currentAttenuation);
                const meterPct = getMeterPercentage(activeReport.currentAttenuation);

                return (
                  <div className={`hud-gauge-card ${status.toLowerCase()}`}>
                    <div className="hud-gauge-top">
                      <div className={`hud-dbm-big ${tone}`}>
                        {activeReport.currentAttenuation.toFixed(1)} <small>dBm</small>
                      </div>
                      <span className={`hud-status-badge ${status.toLowerCase()}`}>
                        {status === 'Normal' && 'OPTIMAL'}
                        {status === 'Warning' && 'PERLU PANTAU'}
                        {status === 'Critical' && 'KRITIS - DROP'}
                      </span>
                    </div>

                    <div className="hud-spectrum-bar" title={`Posisi spektrum ukur: ${activeReport.currentAttenuation} dBm`}>
                      <div
                        className={`hud-spectrum-fill ${status.toLowerCase()}`}
                        style={{ width: `${meterPct}%` }}
                      />
                    </div>
                    <div className="hud-spectrum-labels">
                      <span>-30 dBm</span>
                      <span>-22.0</span>
                      <span>-15.0</span>
                      <span>-10 dBm</span>
                    </div>

                    <p className="hud-diagnostic-text">
                      {status === 'Normal' && (
                        <>Sinyal redaman optik berada di rentang ideal (<b>-15.0 s/d -22.0 dBm</b>) untuk transmisi GPON tanpa <i>packet loss</i>.</>
                      )}
                      {status === 'Warning' && (
                        <>Sinyal mendekati ambang batas margin redaman (<b>-22.1 s/d -25.0 dBm</b>). Disarankan inspeksi konektor patch cord dan adaptor ODP.</>
                      )}
                      {status === 'Critical' && (
                        <>Sinyal redaman drop kritis (<b>&lt; -25.0 dBm</b>). Risiko tinggi terjadi degradasi layanan pelanggan atau link optik terputus.</>
                      )}
                    </p>
                  </div>
                );
              })()}

              {/* Customer & Physical Network Spec */}
              <div>
                <div className="hud-section-label">IDENTITAS FISIK &amp; JARINGAN</div>
                <div className="hud-spec-grid">
                  <div className="hud-spec-item full-width">
                    <div className="hud-spec-key">Nama Pelanggan</div>
                    <div className="hud-spec-val">{activeReport.customerName}</div>
                  </div>
                  <div className="hud-spec-item">
                    <div className="hud-spec-key">Nomor SIA</div>
                    <div className="hud-spec-val"><code>{activeReport.siaNumber}</code></div>
                  </div>
                  <div className="hud-spec-item">
                    <div className="hud-spec-key">Cluster Area</div>
                    <div className="hud-spec-val">{activeReport.cluster}</div>
                  </div>
                  <div className="hud-spec-item">
                    <div className="hud-spec-key">Splitter ODP Fisik</div>
                    <div className="hud-spec-val"><code>{activeReport.splitterCode || 'ODP-BDG-01'}</code></div>
                  </div>
                  <div className="hud-spec-item">
                    <div className="hud-spec-key">Alokasi Port</div>
                    <div className="hud-spec-val">Port {activeReport.portNumber || 1}</div>
                  </div>
                </div>
              </div>

              {/* Field Security & Verification (PRD 3.3) */}
              <div>
                <div className="hud-section-label">INTEGRITAS LAPANGAN &amp; ANTI-FAKE GPS</div>
                <div className="hud-security-box">
                  <div className="hud-sec-row">
                    <span className="hud-sec-label">Teknisi Bertugas</span>
                    <span className="hud-sec-val">{activeReport.assignedTech}</span>
                  </div>
                  <div className="hud-sec-row">
                    <span className="hud-sec-label">Jarak ke Titik ODP</span>
                    {activeReport.distanceToSplitterM && activeReport.distanceToSplitterM > 100 ? (
                      <span className="hud-sec-val warning">
                        {activeReport.distanceToSplitterM}m (Mismatch)
                      </span>
                    ) : (
                      <span className="hud-sec-val verified">
                        {activeReport.distanceToSplitterM ?? 18}m (Toleransi OK)
                      </span>
                    )}
                  </div>
                  <div className="hud-sec-row">
                    <span className="hud-sec-label">Deteksi Mock GPS</span>
                    <span className="hud-sec-val verified">
                      Negatif (OS Verified)
                    </span>
                  </div>
                  <div className="hud-sec-row">
                    <span className="hud-sec-label">Bukti Foto OPM</span>
                    <span className="hud-sec-val verified">
                      MinIO Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="hud-actions">
                <button
                  className="hud-btn-primary"
                  onClick={() => setModalTicket(activeReport)}
                  type="button"
                >
                  <span>Lihat Rincian Lengkap Tiket</span>
                </button>

                <Link
                  href="/network"
                  className="hud-btn-secondary"
                >
                  <span>Buka di Master Jaringan</span>
                </Link>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={modalTicket}
        onClose={() => setModalTicket(null)}
      />
    </main>
  );
}

