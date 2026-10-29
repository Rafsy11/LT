'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { classifyDbm, type CustomerListItem } from '@repo/shared';
import type { CustomerStatusTab } from '../components/customer-filters';

export function useCustomers() {
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

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/admin/customers');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCustomers(json.data);
      }
    } catch (err) {
      console.error('[useCustomers] Gagal mengambil data pelanggan:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Distinct Options for Cluster Navigation Tabs
  const availableClusters = useMemo(() => {
    const defaultList = [
      'Bandung Utara',
      'Bandung Selatan',
      'Bandung Timur',
      'Bandung Barat',
      'Cimahi',
      'Rancaekek',
    ];
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
          c.cluster.toLowerCase().includes(cl.toLowerCase().replace('bandung ', '').trim()),
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
        if (
          kecamatan === 'Semua kecamatan' ||
          c.kecamatan?.toLowerCase() === kecamatan.toLowerCase()
        ) {
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
        const matchKec =
          kecamatan === 'Semua kecamatan' || c.kecamatan?.toLowerCase() === kecamatan.toLowerCase();
        const matchKel =
          kelurahan === 'Semua kelurahan' || c.kelurahan?.toLowerCase() === kelurahan.toLowerCase();
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

  const resetWilayahFilters = useCallback(() => {
    setKecamatan('Semua kecamatan');
    setKelurahan('Semua kelurahan');
    setJalan('Semua jalan');
  }, []);

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

      return (
        matchesCluster && matchesSearch && matchesKecamatan && matchesKelurahan && matchesJalan
      );
    });
  }, [customers, cluster, search, kecamatan, kelurahan, jalan]);

  // Telemetry Counts
  const activeCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'ACTIVE').length,
    [clusterScoped],
  );
  const pendingCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'PENDING_INSTALL').length,
    [clusterScoped],
  );
  const criticalCount = useMemo(
    () => clusterScoped.filter((c) => classifyDbm(c.currentAttenuation) === 'Critical').length,
    [clusterScoped],
  );
  const isolatedCount = useMemo(
    () => clusterScoped.filter((c) => c.status === 'ISOLATED').length,
    [clusterScoped],
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

  return {
    search,
    setSearch,
    cluster,
    setCluster,
    statusTab,
    setStatusTab,
    customers,
    loading,
    fetchCustomers,
    selectedCustomer,
    setSelectedCustomer,
    kecamatan,
    setKecamatan,
    kelurahan,
    setKelurahan,
    jalan,
    setJalan,
    isWilayahFilterOpen,
    setIsWilayahFilterOpen,
    resetWilayahFilters,
    availableClusters,
    clusterCounts,
    availableKecamatans,
    availableKelurahans,
    availableJalans,
    activeWilayahCount,
    clusterScoped,
    activeCount,
    pendingCount,
    criticalCount,
    isolatedCount,
    displayedCustomers,
  };
}
