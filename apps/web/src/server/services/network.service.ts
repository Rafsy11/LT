import { prisma, Prisma } from '@repo/database';
import {
  FALLBACK_CLUSTERS,
  classifyDbm,
  isAttenuationBad,
  type ClusterListItem,
  type ClusterOptionItem,
  type OdpHistoryEntry,
  type OdpMapCustomerPoint,
  type OdpMapRadarItem,
  type OdpRadarStatus,
  type NetworkAuditFinding,
  type NetworkAuditResult,
  type SplitterPortState,
  type SplitterPortActivity,
  type CreateClusterInput,
  type CreateSplitterInput,
  type UpdateSplitterInput,
  type UserSessionContext,
} from '@repo/shared';
import {
  isStrictLiveMode,
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
} from '../lib/live-data';
import { minioManager } from '../lib/minio';

export { FALLBACK_CLUSTERS };
export type { ClusterListItem, SplitterPortState, SplitterPortActivity };

const MEMORY_CLUSTERS: ClusterListItem[] = FALLBACK_CLUSTERS.map((c) => ({
  ...c,
  ports: c.ports.map((p) => ({ ...p })),
}));

export class NetworkService {
  private static filterClusters(
    items: ClusterListItem[],
    search = '',
    clusterFilter = 'Semua cluster',
  ): ClusterListItem[] {
    let filtered = items;
    if (clusterFilter && clusterFilter !== 'Semua cluster') {
      const needle = clusterFilter.replace(/^(?:Bandung|Palembang)\s+/i, '').trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.clusterCode.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(clusterFilter.trim().toLowerCase()) ||
          item.clusterCode.toLowerCase().includes(clusterFilter.trim().toLowerCase()),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.clusterCode.toLowerCase().includes(q) ||
          item.splitterCode.toLowerCase().includes(q) ||
          (item.locationName && item.locationName.toLowerCase().includes(q)),
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
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat data cluster & ODP.')) {
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

        if (isStrictLiveMode() || clusters.length > 0) {
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
                locationName: s.name ?? undefined,
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
        rethrowIfStrictDatabaseError(err, 'Gagal membaca data cluster jaringan dari PostgreSQL.');
      }
    }

    // Graceful fallback (non-strict test mode only)
    return this.filterClusters([...MEMORY_CLUSTERS], search, clusterFilter);
  }

  /**
   * Lists all active cluster wilayah options for dynamic dropdowns across the dashboard.
   */
  public static async listClusterOptions(): Promise<ClusterOptionItem[]> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat daftar cluster.')) {
      try {
        const rows = await prisma.networkCluster.findMany({
          where: { isActive: true },
          include: {
            _count: {
              select: { splitters: true },
            },
          },
          orderBy: { clusterCode: 'asc' },
        });
        return rows.map((c) => ({
          id: c.id,
          clusterCode: c.clusterCode,
          name: c.name,
          centerLat: Number(c.centerLat),
          centerLng: Number(c.centerLng),
          isActive: c.isActive,
          splittersCount: c._count.splitters,
        }));
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal mengambil daftar wilayah cluster dari PostgreSQL.');
      }
    }

    const dedup = new Map<string, ClusterOptionItem>();
    for (const s of MEMORY_CLUSTERS) {
      const existing = dedup.get(s.clusterCode);
      if (existing) {
        existing.splittersCount += 1;
      } else {
        dedup.set(s.clusterCode, {
          id: s.clusterCode,
          clusterCode: s.clusterCode,
          name: s.name,
          centerLat: s.lat,
          centerLng: s.lng,
          isActive: true,
          splittersCount: 1,
        });
      }
    }
    return Array.from(dedup.values());
  }

  /**
   * Creates a new Network Cluster in PostgreSQL or in-memory store with immutable audit logging.
   */
  public static async createCluster(
    input: CreateClusterInput,
    actor: UserSessionContext,
  ): Promise<{ id: string; clusterCode: string; name: string }> {
    const code = input.clusterCode.toUpperCase();

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk membuat cluster baru.')) {
      try {
        const existing = await prisma.networkCluster.findUnique({ where: { clusterCode: code } });
        if (existing) {
          throw new Error(`Cluster dengan kode "${code}" sudah terdaftar.`);
        }

        const created = await prisma.$transaction(async (tx) => {
          const cluster = await tx.networkCluster.create({
            data: {
              clusterCode: code,
              name: input.name,
              centerLat: input.centerLat,
              centerLng: input.centerLng,
              isActive: true,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'CLUSTER_CREATED',
              targetEntity: 'network_cluster',
              targetId: cluster.id,
              newPayload: {
                clusterCode: code,
                name: input.name,
                centerLat: input.centerLat,
                centerLng: input.centerLng,
              } as Prisma.InputJsonValue,
            },
          });

          return cluster;
        });

        return { id: created.id, clusterCode: created.clusterCode, name: created.name };
      } catch (err) {
        if (err instanceof Error && err.message.includes('sudah terdaftar')) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan cluster baru ke PostgreSQL.');
      }
    }

    if (MEMORY_CLUSTERS.some((c) => c.clusterCode.toUpperCase() === code)) {
      throw new Error(`Cluster dengan kode "${code}" sudah terdaftar.`);
    }

    const placeholderSplitter: ClusterListItem = {
      id: `cluster-${Date.now()}`,
      clusterCode: code,
      name: input.name,
      splitterCode: `ODP-${code.replace(/[^A-Z0-9]/g, '')}-01`,
      usedPorts: 0,
      maxPorts: 8,
      lat: input.centerLat,
      lng: input.centerLng,
      ports: Array.from({ length: 8 }, (_, idx) => ({
        portNumber: idx + 1,
        isOccupied: false,
      })),
    };
    MEMORY_CLUSTERS.push(placeholderSplitter);
    return { id: placeholderSplitter.id, clusterCode: code, name: input.name };
  }

  /**
   * Creates a new ODP / Splitter inside a target Cluster.
   */
  public static async createSplitter(
    input: CreateSplitterInput,
    actor: UserSessionContext,
  ): Promise<ClusterListItem> {
    const splitterCode = input.splitterCode.toUpperCase();

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk membuat ODP splitter.')) {
      try {
        const dup = await prisma.networkSplitter.findUnique({ where: { splitterCode } });
        if (dup) {
          throw new Error(`ODP Splitter "${splitterCode}" sudah terdaftar.`);
        }

        const cluster = await prisma.networkCluster.findFirst({
          where: {
            OR: [
              { clusterCode: { equals: input.clusterCode, mode: 'insensitive' } },
              { name: { equals: input.clusterCode, mode: 'insensitive' } },
            ],
          },
        });
        if (!cluster) {
          throw new Error(`Cluster "${input.clusterCode}" tidak ditemukan di PostgreSQL.`);
        }

        const created = await prisma.$transaction(async (tx) => {
          const s = await tx.networkSplitter.create({
            data: {
              clusterId: cluster.id,
              splitterCode,
              name: input.name ?? null,
              notes: input.notes ?? null,
              lat: input.lat,
              lng: input.lng,
              maxPorts: input.maxPorts,
              isActive: true,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'SPLITTER_CREATED',
              targetEntity: 'network_splitter',
              targetId: s.id,
              newPayload: {
                clusterCode: cluster.clusterCode,
                splitterCode,
                name: input.name ?? null,
                notes: input.notes ?? null,
                maxPorts: input.maxPorts,
              } as Prisma.InputJsonValue,
            },
          });

          return s;
        });

        return {
          id: created.id,
          clusterCode: cluster.clusterCode,
          name: cluster.name,
          splitterCode: created.splitterCode,
          locationName: created.name ?? undefined,
          usedPorts: 0,
          maxPorts: created.maxPorts,
          lat: Number(created.lat),
          lng: Number(created.lng),
          ports: Array.from({ length: created.maxPorts }, (_, i) => ({
            portNumber: i + 1,
            isOccupied: false,
          })),
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('sudah terdaftar') || err.message.includes('tidak ditemukan'))
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan ODP splitter ke PostgreSQL.');
      }
    }

    if (MEMORY_CLUSTERS.some((s) => s.splitterCode.toUpperCase() === splitterCode)) {
      throw new Error(`ODP Splitter "${splitterCode}" sudah terdaftar.`);
    }

    const clusterMatch = MEMORY_CLUSTERS.find(
      (c) =>
        c.clusterCode.toLowerCase() === input.clusterCode.toLowerCase() ||
        c.name.toLowerCase() === input.clusterCode.toLowerCase(),
    );

    const newItem: ClusterListItem = {
      id: `splitter-${Date.now()}`,
      clusterCode: clusterMatch?.clusterCode || input.clusterCode.toUpperCase(),
      name: clusterMatch?.name || input.clusterCode,
      splitterCode,
      locationName: input.name,
      usedPorts: 0,
      maxPorts: input.maxPorts,
      lat: input.lat,
      lng: input.lng,
      ports: Array.from({ length: input.maxPorts }, (_, i) => ({
        portNumber: i + 1,
        isOccupied: false,
      })),
    };
    MEMORY_CLUSTERS.push(newItem);
    return newItem;
  }

  /**
   * Updates ODP / Splitter coordinates, port capacity, or active status.
   */
  public static async updateSplitter(
    input: UpdateSplitterInput,
    actor: UserSessionContext,
  ): Promise<ClusterListItem> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memperbarui ODP splitter.')) {
      try {
        const existing = await prisma.networkSplitter.findUnique({
          where: { splitterCode: input.splitterCode },
          include: {
            cluster: true,
            customers: { where: { status: 'ACTIVE' } },
          },
        });
        if (!existing) {
          throw new Error(`ODP Splitter "${input.splitterCode}" tidak ditemukan.`);
        }

        const nextMaxPorts = input.maxPorts ?? existing.maxPorts;
        const maxOccupiedPort = existing.customers.reduce(
          (max, c) => (c.portNumber && c.portNumber > max ? c.portNumber : max),
          0,
        );
        if (nextMaxPorts < maxOccupiedPort) {
          throw new Error(
            `Kapasitas tidak dapat dikurangi ke ${nextMaxPorts} port karena Port #${maxOccupiedPort} masih terisi pelanggan aktif.`,
          );
        }

        const updated = await prisma.$transaction(async (tx) => {
          const s = await tx.networkSplitter.update({
            where: { id: existing.id },
            data: {
              name: input.name !== undefined ? input.name : existing.name,
              notes: input.notes !== undefined ? input.notes : existing.notes,
              lat: input.lat ?? existing.lat,
              lng: input.lng ?? existing.lng,
              maxPorts: nextMaxPorts,
              isActive: input.isActive ?? existing.isActive,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'SPLITTER_UPDATED',
              targetEntity: 'network_splitter',
              targetId: existing.id,
              oldPayload: {
                name: existing.name,
                notes: existing.notes,
                lat: Number(existing.lat),
                lng: Number(existing.lng),
                maxPorts: existing.maxPorts,
                isActive: existing.isActive,
              } as Prisma.InputJsonValue,
              newPayload: {
                name: s.name,
                notes: s.notes,
                lat: Number(s.lat),
                lng: Number(s.lng),
                maxPorts: s.maxPorts,
                isActive: s.isActive,
              } as Prisma.InputJsonValue,
            },
          });

          return s;
        });

        const customerMap = new Map(existing.customers.map((c) => [c.portNumber, c]));
        const ports: SplitterPortState[] = Array.from({ length: updated.maxPorts }, (_, i) => {
          const portNum = i + 1;
          const cust = customerMap.get(portNum);
          return {
            portNumber: portNum,
            isOccupied: Boolean(cust),
            customerName: cust?.fullName,
            siaNumber: cust?.siaNumber,
            attenuation: cust?.currentAttenuation ? Number(cust.currentAttenuation) : undefined,
            status: cust?.status,
          };
        });

        return {
          id: updated.id,
          clusterCode: existing.cluster.clusterCode,
          name: existing.cluster.name,
          splitterCode: updated.splitterCode,
          locationName: updated.name ?? undefined,
          usedPorts: ports.filter((p) => p.isOccupied).length,
          maxPorts: updated.maxPorts,
          lat: Number(updated.lat),
          lng: Number(updated.lng),
          ports,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('tidak ditemukan') || err.message.includes('terisi'))
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui konfigurasi splitter di PostgreSQL.');
      }
    }

    const idx = MEMORY_CLUSTERS.findIndex((s) => s.splitterCode === input.splitterCode);
    if (idx === -1) {
      throw new Error(`ODP Splitter "${input.splitterCode}" tidak ditemukan.`);
    }
    const target = MEMORY_CLUSTERS[idx];
    if (input.name !== undefined) target.locationName = input.name;
    if (input.lat !== undefined) target.lat = input.lat;
    if (input.lng !== undefined) target.lng = input.lng;
    if (input.maxPorts !== undefined && input.maxPorts !== target.maxPorts) {
      const nextPorts: SplitterPortState[] = Array.from({ length: input.maxPorts }, (_, i) => {
        const existingPort = target.ports[i];
        return existingPort || { portNumber: i + 1, isOccupied: false };
      });
      target.maxPorts = input.maxPorts;
      target.ports = nextPorts;
    }
    return target;
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

  /**
   * Retrieves ODP / optical attenuation history logs from PostgreSQL attenuation_history & tickets.
   */
  public static async getOdpHistoryLogs(
    clusterFilter = 'Semua cluster',
    splitterCode?: string,
  ): Promise<OdpHistoryEntry[]> {
    const dbReady = await requireLiveDatabase(
      'Database PostgreSQL diperlukan untuk membaca log histori ODP.',
    );
    if (!dbReady) {
      return [];
    }

    try {
      const needle =
        clusterFilter && clusterFilter !== 'Semua cluster'
          ? clusterFilter.replace(/^(?:Bandung|Palembang)\s+/i, '').trim()
          : '';

      const records = await prisma.attenuationHistory.findMany({
        where: {
          ...(splitterCode ? { splitter: { splitterCode } } : {}),
          ...(needle
            ? {
                customer: {
                  cluster: {
                    OR: [
                      { name: { contains: needle, mode: 'insensitive' } },
                      { clusterCode: { contains: needle, mode: 'insensitive' } },
                      { name: { contains: clusterFilter.trim(), mode: 'insensitive' } },
                      { clusterCode: { contains: clusterFilter.trim(), mode: 'insensitive' } },
                    ],
                  },
                },
              }
            : {}),
        },
        include: {
          customer: true,
          splitter: true,
          tech: { select: { id: true, fullName: true, username: true } },
          ticket: {
            include: {
              assignedTech: { select: { id: true, fullName: true, username: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return records.map((r) => {
        const mappedAction: OdpHistoryEntry['actionType'] =
          r.ticket?.ticketType === 'PSB' ? 'PEMASANGAN' : 'MAINTENANCE';
        const pendingMeta =
          r.ticket?.pendingPayload && typeof r.ticket.pendingPayload === 'object'
            ? (r.ticket.pendingPayload as { technicianNotes?: string })
            : null;

        return {
          id: r.id,
          ticketNumber: r.ticket?.ticketNumber || 'MANUAL-LOG',
          customerName: r.customer.fullName,
          siaNumber: r.customer.siaNumber,
          splitterCode: r.splitter.splitterCode || '-',
          portNumber: r.portNumber || r.customer.portNumber || 0,
          actionType: mappedAction,
          oldAttenuation: r.oldAttenuation !== null ? Number(r.oldAttenuation) : null,
          newAttenuation: Number(r.newAttenuation),
          technicianName: r.tech?.fullName || r.ticket?.assignedTech?.fullName || 'Tim NOC',
          distanceToSplitterM:
            r.distanceToSplitterM !== null ? Number(r.distanceToSplitterM) : null,
          isLocationFlagged: Boolean(r.isLocationFlagged),
          notes:
            pendingMeta?.technicianNotes ||
            r.ticket?.complaintSummary ||
            r.ticket?.adminNotes ||
            undefined,
          timestamp: r.createdAt.toISOString(),
        };
      });
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal membaca histori ODP dari PostgreSQL.');
      throw err;
    }
  }

  /**
   * Audits physical network splitters, port collisions, optical attenuation alerts, and geofence flags.
   */
  public static async runNetworkAudit(actor: UserSessionContext): Promise<NetworkAuditResult> {
    await requireLiveDatabase('Database PostgreSQL diperlukan untuk menjalankan audit jaringan.');

    try {
      const [clusters, splitters, activeCustomers, flaggedHistories] = await Promise.all([
        prisma.networkCluster.findMany({ where: { isActive: true } }),
        prisma.networkSplitter.findMany({
          include: {
            cluster: true,
            customers: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                siaNumber: true,
                fullName: true,
                portNumber: true,
                currentAttenuation: true,
              },
            },
          },
        }),
        prisma.customer.findMany({
          where: { status: 'ACTIVE' },
          include: { cluster: true, splitter: true },
        }),
        prisma.attenuationHistory.findMany({
          where: { isLocationFlagged: true },
          include: {
            ticket: true,
            customer: { include: { cluster: true } },
            splitter: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
      ]);

      const findings: NetworkAuditFinding[] = [];
      let totalPorts = 0;
      let usedPorts = 0;
      let warningSplitters = 0;
      let doubleBookedPorts = 0;

      for (const s of splitters) {
        totalPorts += s.maxPorts;
        usedPorts += s.customers.length;
        const utilPct = s.maxPorts > 0 ? Math.round((s.customers.length / s.maxPorts) * 100) : 0;

        if (utilPct >= 85) {
          warningSplitters += 1;
          findings.push({
            id: `cap-${s.id}`,
            severity: utilPct >= 100 ? 'critical' : 'warning',
            category: 'CAPACITY',
            clusterCode: s.cluster.clusterCode,
            splitterCode: s.splitterCode,
            title: `Kapasitas ${s.splitterCode} ${utilPct}% terisi (${s.customers.length}/${s.maxPorts} port)`,
            description:
              utilPct >= 100
                ? 'ODP penuh. Segera tambah splitter sekunder atau ekspansi trunk.'
                : 'Kapasitas port tersisa sedikit, siapkan ekspansi split.',
          });
        }

        const portGroups = new Map<number, typeof s.customers>();
        for (const c of s.customers) {
          if (!c.portNumber) continue;
          const group = portGroups.get(c.portNumber) || [];
          group.push(c);
          portGroups.set(c.portNumber, group);
        }
        for (const [portNo, list] of portGroups.entries()) {
          if (list.length > 1) {
            doubleBookedPorts += 1;
            findings.push({
              id: `dup-${s.id}-${portNo}`,
              severity: 'critical',
              category: 'DOUBLE_BOOKING',
              clusterCode: s.cluster.clusterCode,
              splitterCode: s.splitterCode,
              title: `Konflik Port #${portNo} di ${s.splitterCode}`,
              description: `Terdeteksi ${list.length} pelanggan aktif pada port yang sama: ${list.map((c) => c.siaNumber).join(', ')}.`,
            });
          }
        }
      }

      let criticalAttenuationCount = 0;
      for (const c of activeCustomers) {
        const dbm = Number(c.currentAttenuation);
        const status = classifyDbm(dbm);
        if (status === 'Critical' || status === 'Warning') {
          const isCritical = status === 'Critical';
          if (isCritical) criticalAttenuationCount += 1;
          findings.push({
            id: `att-${c.id}`,
            severity: isCritical ? 'critical' : 'warning',
            category: 'ATTENUATION',
            clusterCode: c.cluster.clusterCode,
            splitterCode: c.splitter?.splitterCode || '-',
            title: `Redaman ${isCritical ? 'Jelek (> 28 dB)' : 'Mendekati Batas'} ${dbm.toFixed(1)} dBm · ${c.siaNumber}`,
            description: `Pelanggan ${c.fullName} (Port #${c.portNumber || '-'}) ${isCritical ? 'melewati batas maksimal normal 28 dB.' : 'berada di rentang mendekati batas 28 dB.'}`,
          });
        }
      }

      for (const h of flaggedHistories) {
        findings.push({
          id: `geo-${h.id}`,
          severity: 'warning',
          category: 'GEOFENCE',
          clusterCode: h.customer.cluster.clusterCode,
          splitterCode: h.splitter.splitterCode || '-',
          title: `Anomali GPS Tiket ${h.ticket?.ticketNumber || h.ticketId}`,
          description: `Jarak submit ${h.distanceToSplitterM !== null ? Number(h.distanceToSplitterM) : '?'} m dari koordinat ODP terdaftar.`,
        });
      }

      const result: NetworkAuditResult = {
        auditedAt: new Date().toISOString(),
        totalClusters: clusters.length,
        totalSplitters: splitters.length,
        totalPorts,
        usedPorts,
        warningSplitters,
        criticalAttenuationCount,
        doubleBookedPorts,
        geofenceAnomalies: flaggedHistories.length,
        findings,
      };

      await prisma.activityLog.create({
        data: {
          actorUserId: actor.userId,
          actorRole: actor.role,
          actionType: 'NETWORK_AUDIT_RUN',
          targetEntity: 'network',
          targetId: 'global_audit',
          newPayload: {
            totalSplitters: result.totalSplitters,
            findingsCount: findings.length,
            criticalAttenuationCount,
            doubleBookedPorts,
          } as Prisma.InputJsonValue,
        },
      });

      return result;
    } catch (err) {
      rethrowIfStrictDatabaseError(err, 'Gagal menjalankan audit jaringan di PostgreSQL.');
      throw err;
    }
  }

  /**
   * Lists ODP datek points with radar health classification (Normal <= 28 dB vs Abnormal > 28 dB / active issue)
   * and attached customer coordinates for the dedicated /maps module.
   */
  public static async listOdpRadarMap(
    search = '',
    clusterFilter = 'Semua cluster',
  ): Promise<OdpMapRadarItem[]> {
    const resolveMapPhotoUrl = async (key: string | null | undefined): Promise<string | null> => {
      if (!key) return null;
      if (key.startsWith('https://') || key.startsWith('/assets/')) return key;
      try {
        return await minioManager.generatePresignedGetUrl(key);
      } catch {
        return null;
      }
    };

    const filterRadarItems = (items: OdpMapRadarItem[]): OdpMapRadarItem[] => {
      let filtered = items;
      if (clusterFilter && clusterFilter !== 'Semua cluster') {
        const needle = clusterFilter.replace(/^(?:Bandung|Palembang)\s+/i, '').trim().toLowerCase();
        const rawLower = clusterFilter.trim().toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.clusterName.toLowerCase().includes(needle) ||
            item.clusterCode.toLowerCase().includes(needle) ||
            item.clusterName.toLowerCase().includes(rawLower) ||
            item.clusterCode.toLowerCase().includes(rawLower),
        );
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.splitterCode.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.clusterCode.toLowerCase().includes(q) ||
            item.clusterName.toLowerCase().includes(q) ||
            item.customers.some(
              (c) =>
                c.fullName.toLowerCase().includes(q) ||
                c.siaNumber.toLowerCase().includes(q) ||
                (c.picName && c.picName.toLowerCase().includes(q)),
            ),
        );
      }
      return filtered;
    };

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat peta radar ODP.')) {
      try {
        const splitters = await prisma.networkSplitter.findMany({
          include: {
            cluster: true,
            customers: {
              where: { status: { not: 'DISMANTLED' } },
              include: {
                tickets: {
                  where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL'] } },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { ticketNumber: true },
                },
              },
              orderBy: [{ portNumber: 'asc' }, { fullName: 'asc' }],
            },
          },
          orderBy: { splitterCode: 'asc' },
        });

        const radarItems: OdpMapRadarItem[] = await Promise.all(
          splitters.map(async (s) => {
            const customers: OdpMapCustomerPoint[] = await Promise.all(
              s.customers.map(async (c) => {
                const cur = c.currentAttenuation != null ? Number(c.currentAttenuation) : null;
                const olt = c.oltAttenuation != null ? Number(c.oltAttenuation) : null;
                const ont = c.ontAttenuation != null ? Number(c.ontAttenuation) : cur;
                return {
                  id: c.id,
                  siaNumber: c.siaNumber,
                  fullName: c.fullName,
                  portNumber: c.portNumber ?? null,
                  lat: c.lat ? Number(c.lat) : null,
                  lng: c.lng ? Number(c.lng) : null,
                  currentAttenuation: cur,
                  oltAttenuation: olt,
                  ontAttenuation: ont,
                  status: c.status,
                  picName: c.picName ?? null,
                  picPhone: c.picPhone ?? null,
                  photoUrl: await resolveMapPhotoUrl(c.photoObjectKey),
                  openTicketNumber: c.tickets[0]?.ticketNumber ?? null,
                };
              }),
            );

            const measuredValues: number[] = [];
            let badPortCount = 0;
            let openTicketCount = 0;

            for (const c of customers) {
              const readings = [c.ontAttenuation, c.oltAttenuation, c.currentAttenuation].filter(
                (v): v is number => typeof v === 'number' && Number.isFinite(v),
              );
              if (readings.length > 0) {
                const worstForCust = Math.min(...readings);
                measuredValues.push(worstForCust);
                if (readings.some((v) => isAttenuationBad(v))) {
                  badPortCount += 1;
                }
              }
              if (c.openTicketNumber) {
                openTicketCount += 1;
              }
            }

            const worstAttenuation =
              measuredValues.length > 0 ? Math.min(...measuredValues) : null;
            const avgAttenuation =
              measuredValues.length > 0
                ? Number(
                    (
                      measuredValues.reduce((sum, v) => sum + v, 0) / measuredValues.length
                    ).toFixed(1),
                  )
                : null;

            const anomalyReasons: string[] = [];
            if (badPortCount > 0) {
              anomalyReasons.push(
                `${badPortCount} pelanggan memiliki redaman jelek (> 28 dB${worstAttenuation !== null ? `, terburuk ${worstAttenuation.toFixed(1)} dBm` : ''})`,
              );
            }
            if (!s.isActive) {
              anomalyReasons.push('Status ODP sedang nonaktif');
            }
            if (openTicketCount > 0) {
              anomalyReasons.push(`${openTicketCount} tiket gangguan aktif terbuka`);
            }

            let radarStatus: OdpRadarStatus = 'UNMEASURED';
            if (badPortCount > 0 || !s.isActive || openTicketCount > 0) {
              radarStatus = 'ABNORMAL';
            } else if (measuredValues.length > 0) {
              radarStatus = 'NORMAL';
            }

            return {
              id: s.id,
              splitterCode: s.splitterCode,
              name: s.name || s.splitterCode,
              notes: s.notes ?? null,
              clusterCode: s.cluster.clusterCode,
              clusterName: s.cluster.name,
              lat: Number(s.lat),
              lng: Number(s.lng),
              maxPorts: s.maxPorts,
              usedPorts: customers.filter((c) => c.status === 'ACTIVE').length,
              isActive: s.isActive,
              radarStatus,
              worstAttenuation,
              avgAttenuation,
              measuredCount: measuredValues.length,
              badPortCount,
              openTicketCount,
              anomalyReasons,
              customers,
            };
          }),
        );

        return filterRadarItems(radarItems);
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal membaca titik datek ODP dari PostgreSQL.');
      }
    }

    const fallbackItems: OdpMapRadarItem[] = MEMORY_CLUSTERS.map((s) => {
      const measured = s.ports
        .map((p) => p.attenuation)
        .filter((v): v is number => typeof v === 'number');
      const badPortCount = measured.filter((v) => isAttenuationBad(v)).length;
      const worstAttenuation = measured.length > 0 ? Math.min(...measured) : null;
      const avgAttenuation =
        measured.length > 0
          ? Number((measured.reduce((acc, v) => acc + v, 0) / measured.length).toFixed(1))
          : null;
      const radarStatus: OdpRadarStatus =
        badPortCount > 0 ? 'ABNORMAL' : measured.length > 0 ? 'NORMAL' : 'UNMEASURED';

      return {
        id: s.id,
        splitterCode: s.splitterCode,
        name: s.locationName || s.splitterCode,
        notes: null,
        clusterCode: s.clusterCode,
        clusterName: s.name,
        lat: s.lat,
        lng: s.lng,
        maxPorts: s.maxPorts,
        usedPorts: s.usedPorts,
        isActive: true,
        radarStatus,
        worstAttenuation,
        avgAttenuation,
        measuredCount: measured.length,
        badPortCount,
        openTicketCount: 0,
        anomalyReasons:
          badPortCount > 0 ? [`${badPortCount} port melewati batas redaman 28 dB`] : [],
        customers: s.ports
          .filter((p) => p.isOccupied && p.siaNumber)
          .map((p) => ({
            id: `${s.id}-p${p.portNumber}`,
            siaNumber: p.siaNumber!,
            fullName: p.customerName || 'Pelanggan',
            portNumber: p.portNumber,
            lat: null,
            lng: null,
            currentAttenuation: p.attenuation ?? null,
            oltAttenuation: null,
            ontAttenuation: p.attenuation ?? null,
            status: p.status || 'ACTIVE',
            picName: null,
            picPhone: null,
            photoUrl: null,
            openTicketNumber: null,
          })),
      };
    });

    return filterRadarItems(fallbackItems);
  }
}
