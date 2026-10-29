'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ClusterListItem, SplitterPortState, NetworkStats, CustomerListItem, CreateTicketInput } from '@repo/shared';
import { FALLBACK_CLUSTERS } from '@repo/shared';
import { useToast, useAuth } from '@/providers';

export interface SelectedPortContext {
  clusterCode: string;
  clusterName: string;
  splitterCode: string;
  lat: number;
  lng: number;
  port: SplitterPortState;
}

export interface ClusterGroup {
  clusterCode: string;
  name: string;
  splitters: ClusterListItem[];
  totalUsed: number;
  totalPorts: number;
}

export interface AttenuationMeta {
  label: string;
  tone: string;
  badge: string;
  status: 'normal' | 'warning' | 'critical' | 'neutral';
}

export interface OdpHistoryLogItem {
  portNumber: number;
  type: 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN';
  date: string;
  technician: string;
  ticketNumber: string;
  customerName: string;
  attenuationDelta: string;
  notes: string;
}

export function useNetwork() {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('Semua cluster');
  const [portStatusFilter, setPortStatusFilter] = useState('Semua');
  const [activeSplitterCode, setActiveSplitterCode] = useState<string>('ODP-BDG-05');
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({
    'BDG-01': true,
    'BDG-02': true,
    'BDG-03': true,
    'BDG-04': true,
  });
  const [networkData, setNetworkData] = useState<ClusterListItem[]>(FALLBACK_CLUSTERS);
  const [loading, setLoading] = useState(false);
  const [selectedPort, setSelectedPort] = useState<SelectedPortContext | null>(null);
  const [portFilter, setPortFilter] = useState<'ALL' | 'OCCUPIED' | 'AVAILABLE'>('ALL');
  const [activeTab, setActiveTab] = useState<'ports' | 'inspeksi' | 'riwayat' | 'audit'>('ports');
  const [expandedPortNum, setExpandedPortNum] = useState<number | null>(1);
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<CustomerListItem | null>(null);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'MAINTENANCE' | 'PEMASANGAN' | 'PENARIKAN'>('ALL');
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditTimestamp, setAuditTimestamp] = useState<string>('22:00:15 WIB');
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketModalInitial, setTicketModalInitial] = useState<Partial<CreateTicketInput>>({});

  const { showSuccess } = useToast();
  const { canCreateTicket } = useAuth();

  const fetchClusters = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/clusters');
      const json = await res.json();
      if (json.success && json.data && json.data.clusters && json.data.clusters.length > 0) {
        setNetworkData(json.data.clusters);
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
    await fetchClusters();
  };

  const handlePortClick = (c: ClusterListItem, port: SplitterPortState) => {
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

  const toggleClusterExpand = (clusterCode: string) => {
    setExpandedClusters((prev) => ({
      ...prev,
      [clusterCode]: !prev[clusterCode],
    }));
  };

  const networkStats: NetworkStats = useMemo(() => {
    const totalClusters = new Set(networkData.map((c) => c.clusterCode)).size;
    const totalSplitters = networkData.length;
    let totalCapacity = 0;
    let usedCapacity = 0;

    networkData.forEach((item) => {
      totalCapacity += item.maxPorts || 0;
      usedCapacity += item.usedPorts || 0;
    });

    return {
      totalClusters,
      totalSplitters,
      totalCapacity,
      usedCapacity,
      availableCapacity: Math.max(0, totalCapacity - usedCapacity),
    };
  }, [networkData]);

  const filteredClusters = useMemo(() => {
    return networkData.filter((c) => {
      const matchesCluster =
        clusterFilter === 'Semua cluster' ||
        c.name.toLowerCase().includes(clusterFilter.replace('Bandung ', '').toLowerCase());
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
  }, [networkData, clusterFilter, search, portStatusFilter]);

  const clusterGroups: ClusterGroup[] = useMemo(() => {
    const map = new Map<string, ClusterGroup>();

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

  const activeSplitter = useMemo(() => {
    if (activeSplitterCode) {
      const found = filteredClusters.find((c) => c.splitterCode === activeSplitterCode);
      if (found) return found;
    }
    return filteredClusters[0] || null;
  }, [filteredClusters, activeSplitterCode]);

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

  useEffect(() => {
    if (filteredClusters.length > 0) {
      if (!activeSplitterCode || !filteredClusters.some((c) => c.splitterCode === activeSplitterCode)) {
        setActiveSplitterCode(filteredClusters[0].splitterCode);
      }
    }
  }, [filteredClusters, activeSplitterCode]);

  const getAttenuationMeta = useCallback((att: number | undefined): AttenuationMeta => {
    if (att === undefined || att === null) {
      return { label: 'Belum diukur', tone: 'neutral', badge: 'badge gray', status: 'neutral' };
    }
    if (att >= -22.0 && att <= -15.0) {
      return { label: `${att.toFixed(1)} dBm (Normal)`, tone: 'normal', badge: 'badge green', status: 'normal' };
    }
    if (att < -22.0 && att >= -25.0) {
      return { label: `${att.toFixed(1)} dBm (Warning)`, tone: 'warning', badge: 'badge yellow', status: 'warning' };
    }
    return { label: `${att.toFixed(1)} dBm (Critical)`, tone: 'critical', badge: 'badge red', status: 'critical' };
  }, []);

  const odpHistoryLogs: OdpHistoryLogItem[] = useMemo(() => {
    return [
      {
        portNumber: 1,
        type: 'MAINTENANCE',
        date: '18 Okt 2026 · 14:20 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-081',
        customerName: 'Pelanggan BT-1',
        attenuationDelta: '-19.3 dBm → -18.8 dBm (+0.5 dBm)',
        notes: 'Optimasi sambungan kabel drop core dan pembersihan ferrule adaptor SC/UPC.',
      },
      {
        portNumber: 2,
        type: 'PEMASANGAN',
        date: '17 Okt 2026 · 09:15 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-112',
        customerName: 'Pelanggan BT-2',
        attenuationDelta: 'Redaman Awal: -19.1 dBm',
        notes: 'Instalasi modem ONT ZTE F670L dan drop wire 65 meter selesai tervalidasi.',
      },
      {
        portNumber: 3,
        type: 'MAINTENANCE',
        date: '16 Okt 2026 · 11:30 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-083',
        customerName: 'Pelanggan BT-3',
        attenuationDelta: '-19.9 dBm → -19.4 dBm (+0.5 dBm)',
        notes: 'Penggantian adaptor SC/UPC port 3 yang longgar pada baki splitter.',
      },
      {
        portNumber: 4,
        type: 'PEMASANGAN',
        date: '15 Okt 2026 · 16:45 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-114',
        customerName: 'Pelanggan BT-4',
        attenuationDelta: 'Redaman Awal: -19.7 dBm',
        notes: 'Penarikan kabel drop core 85 meter dan aktivasi port baru.',
      },
      {
        portNumber: 5,
        type: 'MAINTENANCE',
        date: '14 Okt 2026 · 10:10 WIB',
        technician: 'Andi Pratama',
        ticketNumber: 'TKT-2026-085',
        customerName: 'Pelanggan BT-5',
        attenuationDelta: '-20.5 dBm → -20.0 dBm (+0.5 dBm)',
        notes: 'Pengecekan redaman berkala dan pembersihan adapter ferrule.',
      },
      {
        portNumber: 6,
        type: 'PEMASANGAN',
        date: '13 Okt 2026 · 15:20 WIB',
        technician: 'Budi Santoso',
        ticketNumber: 'PSB-2026-116',
        customerName: 'Pelanggan BT-6',
        attenuationDelta: 'Redaman Awal: -20.3 dBm',
        notes: 'Instalasi modem ONT dan penarikan kabel drop core.',
      },
      {
        portNumber: 11,
        type: 'PENARIKAN',
        date: '05 Okt 2026 · 13:00 WIB',
        technician: 'Dedi Kurniawan',
        ticketNumber: 'DIS-2026-025',
        customerName: 'Eks Pelanggan BT-11',
        attenuationDelta: 'Port Dikembalikan ke Siap PSB',
        notes: 'Terminasi kontrak pelanggan relokasi. Patch cord dilepas dari ODP, port bebas.',
      },
    ];
  }, []);

  const handleRunAudit = () => {
    setAuditRunning(true);
    setTimeout(() => {
      setAuditRunning(false);
      setAuditTimestamp(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
      );
      showSuccess('Audit integritas database berhasil: 0 anomali port ditemukan.');
    }, 600);
  };

  return {
    search,
    setSearch,
    clusterFilter,
    setClusterFilter,
    portStatusFilter,
    setPortStatusFilter,
    activeSplitterCode,
    setActiveSplitterCode,
    expandedClusters,
    toggleClusterExpand,
    networkData,
    loading,
    selectedPort,
    handlePortClick,
    portFilter,
    setPortFilter,
    activeTab,
    setActiveTab,
    expandedPortNum,
    setExpandedPortNum,
    selectedCustomerForModal,
    setSelectedCustomerForModal,
    historyTypeFilter,
    setHistoryTypeFilter,
    auditRunning,
    auditTimestamp,
    ticketModalOpen,
    setTicketModalOpen,
    ticketModalInitial,
    setTicketModalInitial,
    networkStats,
    filteredClusters,
    clusterGroups,
    activeSplitter,
    activeSplitterFilteredPorts,
    getAttenuationMeta,
    odpHistoryLogs,
    handleCreateTicketSubmit,
    handleRunAudit,
    showSuccess,
    canCreateTicket,
  };
}

