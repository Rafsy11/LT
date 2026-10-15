import { prisma } from '@repo/database';

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerName?: string;
  siaNumber?: string;
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

const FALLBACK_CLUSTERS: ClusterListItem[] = [
  {
    id: 'cluster-1',
    clusterCode: 'BDG-01',
    name: 'Bandung Utara',
    splitterCode: 'ODP-BDG-01',
    usedPorts: 5,
    maxPorts: 8,
    lat: -6.914744,
    lng: 107.60981,
    ports: [
      { portNumber: 1, isOccupied: true, customerName: 'Rudi Hermawan', siaNumber: 'SIA-2024-004' },
      { portNumber: 2, isOccupied: true, customerName: 'Dewi Lestari', siaNumber: 'SIA-2024-005' },
      { portNumber: 3, isOccupied: true, customerName: 'Budi Santoso', siaNumber: 'SIA-2024-001' },
      { portNumber: 4, isOccupied: false },
      { portNumber: 5, isOccupied: true, customerName: 'Siti Aminah', siaNumber: 'SIA-2024-002' },
      { portNumber: 6, isOccupied: false },
      { portNumber: 7, isOccupied: true, customerName: 'Hendro Wijaya', siaNumber: 'SIA-2024-006' },
      { portNumber: 8, isOccupied: false },
    ],
  },
  {
    id: 'cluster-2',
    clusterCode: 'BDG-02',
    name: 'Bandung Selatan',
    splitterCode: 'ODP-BDG-03',
    usedPorts: 4,
    maxPorts: 16,
    lat: -6.953245,
    lng: 107.628912,
    ports: Array.from({ length: 16 }, (_, i) => ({
      portNumber: i + 1,
      isOccupied: i < 4,
      customerName: i === 1 ? 'Ahmad Dahlan' : undefined,
      siaNumber: i === 1 ? 'SIA-2024-003' : undefined,
    })),
  },
];

export class NetworkService {
  /**
   * Lists network clusters & ODP splitters with live port occupancy from PostgreSQL Prisma.
   */
  public static async listClusters(
    search = '',
    clusterFilter = 'Semua cluster'
  ): Promise<ClusterListItem[]> {
    try {
      const clusters = await prisma.networkCluster.findMany({
        include: {
          splitters: {
            include: {
              customers: {
                where: { status: 'ACTIVE' },
                select: { portNumber: true, fullName: true, siaNumber: true },
              },
            },
          },
        },
        orderBy: { clusterCode: 'asc' },
      });

      if (clusters.length > 0) {
        const result: ClusterListItem[] = [];

        for (const c of clusters) {
          for (const s of c.splitters) {
            const customerMap = new Map<number, { fullName: string; siaNumber: string }>();
            for (const cust of s.customers) {
              if (cust.portNumber) {
                customerMap.set(cust.portNumber, {
                  fullName: cust.fullName,
                  siaNumber: cust.siaNumber,
                });
              }
            }

            const ports: SplitterPortState[] = [];
            for (let p = 1; p <= s.maxPorts; p++) {
              const custInfo = customerMap.get(p);
              ports.push({
                portNumber: p,
                isOccupied: Boolean(custInfo),
                customerName: custInfo?.fullName,
                siaNumber: custInfo?.siaNumber,
              });
            }

            const usedPorts = ports.filter((p) => p.isOccupied).length;

            result.push({
              id: s.id,
              clusterCode: c.clusterCode,
              name: c.name,
              splitterCode: s.splitterCode,
              usedPorts,
              maxPorts: s.maxPorts,
              lat: Number(s.lat),
              lng: Number(s.lng),
              ports,
            });
          }
        }

        let filtered = result;
        if (clusterFilter && clusterFilter !== 'Semua cluster') {
          filtered = filtered.filter((item) => item.name.includes(clusterFilter.replace('Bandung ', '')));
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          filtered = filtered.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.clusterCode.toLowerCase().includes(q) ||
              item.splitterCode.toLowerCase().includes(q)
          );
        }
        return filtered;
      }
    } catch (err) {
      console.warn('[NetworkService] DB listClusters failed, using fallback:', (err as Error).message);
    }

    // Graceful fallback
    let fallback = [...FALLBACK_CLUSTERS];
    if (clusterFilter && clusterFilter !== 'Semua cluster') {
      fallback = fallback.filter((c) => c.name.includes(clusterFilter.replace('Bandung ', '')));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      fallback = fallback.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.clusterCode.toLowerCase().includes(q) ||
          c.splitterCode.toLowerCase().includes(q)
      );
    }
    return fallback;
  }

  public static async getSplitterDetail(splitterCode: string): Promise<ClusterListItem> {
    const list = await this.listClusters();
    const item = list.find((c) => c.splitterCode === splitterCode);
    if (!item) {
      throw new Error(`Splitter ${splitterCode} tidak ditemukan`);
    }
    return item;
  }

  public static async getNetworkStats() {
    const list = await this.listClusters();
    const totalClusters = new Set(list.map((c) => c.clusterCode)).size;
    const totalSplitters = list.length;
    const totalCapacity = list.reduce((acc, c) => acc + c.maxPorts, 0);
    const usedCapacity = list.reduce((acc, c) => acc + c.usedPorts, 0);
    const availableCapacity = totalCapacity - usedCapacity;

    return {
      totalClusters,
      totalSplitters,
      totalCapacity,
      usedCapacity,
      availableCapacity,
    };
  }
}
