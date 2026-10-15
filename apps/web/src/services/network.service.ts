import { dataStore } from './data-store';

export class NetworkService {
  public static async listClusters(search = '', clusterFilter = 'Semua cluster') {
    let result = [...dataStore.clusters];

    if (clusterFilter && clusterFilter !== 'Semua cluster') {
      result = result.filter((c) => c.name === clusterFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.clusterCode.toLowerCase().includes(q) ||
          c.splitterCode.toLowerCase().includes(q)
      );
    }

    return result;
  }

  public static async getSplitterDetail(splitterCode: string) {
    const cluster = dataStore.clusters.find((c) => c.splitterCode === splitterCode);
    if (!cluster) {
      throw new Error(`Splitter ${splitterCode} tidak ditemukan`);
    }
    return cluster;
  }

  public static async getNetworkStats() {
    const totalClusters = dataStore.clusters.length;
    const totalSplitters = dataStore.clusters.length;
    const totalCapacity = dataStore.clusters.reduce((acc, c) => acc + c.maxPorts, 0);
    const usedCapacity = dataStore.clusters.reduce((acc, c) => acc + c.usedPorts, 0);
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
