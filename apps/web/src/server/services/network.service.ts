import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import {
  FALLBACK_CLUSTERS,
  type ClusterListItem,
  type SplitterPortState,
  type SplitterPortActivity,
} from '@repo/shared';

export { FALLBACK_CLUSTERS };
export type { ClusterListItem, SplitterPortState, SplitterPortActivity };

export class NetworkService {
  private static filterClusters(
    items: ClusterListItem[],
    search = '',
    clusterFilter = 'Semua cluster',
  ): ClusterListItem[] {
    let filtered = items;
    if (clusterFilter && clusterFilter !== 'Semua cluster') {
      const needle = clusterFilter.replace('Bandung ', '');
      filtered = filtered.filter((item) => item.name.includes(needle));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.clusterCode.toLowerCase().includes(q) ||
          item.splitterCode.toLowerCase().includes(q),
      );
    }
    return filtered;
  }

  public static computeStatsFromClusters(list: ClusterListItem[]) {
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

  /**
   * Lists network clusters & ODP splitters with live port occupancy from PostgreSQL Prisma.
   */
  public static async listClusters(
    search = '',
    clusterFilter = 'Semua cluster',
  ): Promise<ClusterListItem[]> {
    if (await isDatabaseAvailable()) {
      try {
        const clusters = await prisma.networkCluster.findMany({
          include: {
            splitters: {
              include: {
                customers: {
                  where: { status: 'ACTIVE' },
                  select: {
                    portNumber: true,
                    fullName: true,
                    siaNumber: true,
                    currentAttenuation: true,
                    status: true,
                  },
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
              const customerMap = new Map<
                number,
                { fullName: string; siaNumber: string; attenuation?: number; status?: string }
              >();
              for (const cust of s.customers) {
                if (cust.portNumber) {
                  customerMap.set(cust.portNumber, {
                    fullName: cust.fullName,
                    siaNumber: cust.siaNumber,
                    attenuation: cust.currentAttenuation
                      ? Number(cust.currentAttenuation)
                      : undefined,
                    status: cust.status,
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
                  attenuation: custInfo?.attenuation,
                  status: custInfo?.status,
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

          return this.filterClusters(result, search, clusterFilter);
        }
      } catch (err) {
        markDatabaseUnavailable(err);
        console.warn(
          '[NetworkService] DB listClusters failed, using fallback:',
          (err as Error).message,
        );
      }
    }

    // Graceful fallback
    return this.filterClusters([...FALLBACK_CLUSTERS], search, clusterFilter);
  }

  /**
   * Fetches clusters and global network stats in a single DB query pass.
   */
  public static async getClustersWithStats(
    search = '',
    clusterFilter = 'Semua cluster',
  ) {
    const allClusters = await this.listClusters();
    const clusters =
      search.trim() || (clusterFilter && clusterFilter !== 'Semua cluster')
        ? this.filterClusters(allClusters, search, clusterFilter)
        : allClusters;

    return {
      clusters,
      stats: this.computeStatsFromClusters(allClusters),
    };
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
    return this.computeStatsFromClusters(list);
  }
}
