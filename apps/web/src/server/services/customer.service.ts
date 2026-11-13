import { prisma, Prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import {
  ERROR_CODES,
  type CustomerListItem,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type UserSessionContext,
} from '@repo/shared';

const DEFAULT_CUSTOMER_LIST_LIMIT = 200;

export type { CustomerListItem };

export function parseCustomerAddress(address: string): {
  street: string;
  kelurahan: string;
  kecamatan: string;
} {
  const lower = address.toLowerCase();
  const street = address.split(',')[0]?.trim() || address;

  let kecamatan = 'Bandung Wetan';
  if (lower.includes('coblong') || lower.includes('dago') || lower.includes('cikutra')) {
    kecamatan = 'Coblong';
  } else if (lower.includes('sukajadi') || lower.includes('pasteur')) {
    kecamatan = 'Sukajadi';
  } else if (lower.includes('lengkong') || lower.includes('buah batu')) {
    kecamatan = 'Lengkong';
  } else if (
    lower.includes('arcamanik') ||
    lower.includes('soekarno hatta') ||
    lower.includes('sukamiskin')
  ) {
    kecamatan = 'Arcamanik';
  } else if (lower.includes('cimahi') || lower.includes('baros')) {
    kecamatan = 'Cimahi Tengah';
  } else if (lower.includes('rancaekek')) {
    kecamatan = 'Rancaekek';
  } else if (
    lower.includes('riau') ||
    lower.includes('bandung wetan') ||
    lower.includes('citarum')
  ) {
    kecamatan = 'Bandung Wetan';
  }

  let kelurahan = 'Citarum';
  if (lower.includes('dago')) {
    kelurahan = 'Dago';
  } else if (lower.includes('citarum') || lower.includes('riau')) {
    kelurahan = 'Citarum';
  } else if (lower.includes('sadangserang') || lower.includes('cikutra')) {
    kelurahan = 'Sadangserang';
  } else if (lower.includes('malabar') || lower.includes('buah batu')) {
    kelurahan = 'Malabar';
  } else if (lower.includes('sukamiskin') || lower.includes('soekarno hatta')) {
    kelurahan = 'Sukamiskin';
  } else if (lower.includes('pasteur')) {
    kelurahan = 'Pasteur';
  } else if (lower.includes('baros')) {
    kelurahan = 'Baros';
  } else if (lower.includes('rancaekek')) {
    kelurahan = 'Rancaekek Kencana';
  }

  return { street, kelurahan, kecamatan };
}

// Fallback seed data if DB is temporarily empty during build/initialization
const FALLBACK_CUSTOMERS: CustomerListItem[] = [
  {
    id: 'cust-1',
    siaNumber: 'SIA-2024-001',
    fullName: 'Budi Santoso',
    address: 'Jl. Riau No. 45, Citarum, Kec. Bandung Wetan, Bandung',
    lat: -6.9062,
    lng: 107.6186,
    kecamatan: 'Bandung Wetan',
    kelurahan: 'Citarum',
    street: 'Jl. Riau No. 45',
    cluster: 'Bandung Utara',
    clusterCode: 'BDG-01',
    splitterCode: 'ODP-BDG-01',
    portNumber: 3,
    currentAttenuation: -18.5,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-2',
    siaNumber: 'SIA-2024-002',
    fullName: 'Siti Aminah',
    address: 'Jl. Dago No. 112, Dago, Kec. Coblong, Bandung',
    kecamatan: 'Coblong',
    kelurahan: 'Dago',
    street: 'Jl. Dago No. 112',
    cluster: 'Bandung Utara',
    clusterCode: 'BDG-01',
    splitterCode: 'ODP-BDG-01',
    portNumber: 5,
    currentAttenuation: -24.8,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-3',
    siaNumber: 'SIA-2024-003',
    fullName: 'Ahmad Dahlan',
    address: 'Jl. Buah Batu No. 78, Malabar, Kec. Lengkong, Bandung',
    kecamatan: 'Lengkong',
    kelurahan: 'Malabar',
    street: 'Jl. Buah Batu No. 78',
    cluster: 'Bandung Selatan',
    clusterCode: 'BDG-02',
    splitterCode: 'ODP-BDG-03',
    portNumber: 2,
    currentAttenuation: -27.3,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-4',
    siaNumber: 'SIA-2024-004',
    fullName: 'PT. Maju Jaya (Kantor Cabang)',
    address: 'Jl. Soekarno Hatta No. 210, Sukamiskin, Kec. Arcamanik, Bandung',
    kecamatan: 'Arcamanik',
    kelurahan: 'Sukamiskin',
    street: 'Jl. Soekarno Hatta No. 210',
    cluster: 'Bandung Timur',
    clusterCode: 'BDG-03',
    splitterCode: 'ODP-BDG-04',
    portNumber: 1,
    currentAttenuation: -19.2,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-5',
    siaNumber: 'SIA-2024-005',
    fullName: 'IndoTech Solusi',
    address: 'Jl. Pasteur No. 34, Pasteur, Kec. Sukajadi, Bandung',
    kecamatan: 'Sukajadi',
    kelurahan: 'Pasteur',
    street: 'Jl. Pasteur No. 34',
    cluster: 'Bandung Barat',
    clusterCode: 'BDG-04',
    splitterCode: 'ODP-BDG-05',
    portNumber: 4,
    currentAttenuation: -21.4,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-6',
    siaNumber: 'SIA-2024-006',
    fullName: 'Hotel Grand Prima',
    address: 'Jl. Baros No. 12, Baros, Kec. Cimahi Tengah, Cimahi',
    kecamatan: 'Cimahi Tengah',
    kelurahan: 'Baros',
    street: 'Jl. Baros No. 12',
    cluster: 'Cimahi',
    clusterCode: 'CMH-01',
    splitterCode: 'ODP-CMH-01',
    portNumber: 2,
    currentAttenuation: -26.1,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-7',
    siaNumber: 'SIA-2024-007',
    fullName: 'Toko Sejahtera',
    address: 'Jl. Raya Rancaekek No. 89, Rancaekek Kencana, Kec. Rancaekek, Bandung',
    kecamatan: 'Rancaekek',
    kelurahan: 'Rancaekek Kencana',
    street: 'Jl. Raya Rancaekek No. 89',
    cluster: 'Rancaekek',
    clusterCode: 'RCK-01',
    splitterCode: 'ODP-RCK-01',
    portNumber: 1,
    currentAttenuation: -19.8,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-8',
    siaNumber: 'SIA-2024-008',
    fullName: 'Agus Setiawan',
    address: 'Jl. Cikutra Barat No. 15, Sadangserang, Kec. Coblong, Bandung',
    kecamatan: 'Coblong',
    kelurahan: 'Sadangserang',
    street: 'Jl. Cikutra Barat No. 15',
    cluster: 'Bandung Utara',
    clusterCode: 'BDG-01',
    splitterCode: 'ODP-BDG-02',
    portNumber: 1,
    currentAttenuation: -20.0,
    status: 'PENDING_INSTALL',
    updatedAt: new Date().toISOString(),
  },
];

export class CustomerService {
  public static async getCustomerCount(): Promise<number> {
    if (await isDatabaseAvailable()) {
      try {
        const count = await prisma.customer.count();
        if (count > 0) return count;
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }
    return FALLBACK_CUSTOMERS.length;
  }

  /**
   * Retrieves customers list from PostgreSQL via Prisma with search and cluster filtering.
   */
  public static async listCustomers(
    search = '',
    cluster = 'Semua cluster',
  ): Promise<CustomerListItem[]> {
    if (await isDatabaseAvailable()) {
      try {
        const whereClause: Record<string, unknown> = {};

        if (cluster && cluster !== 'Semua cluster') {
          const cleanCluster = cluster.replace('Bandung ', '');
          whereClause.cluster = {
            OR: [
              { name: { contains: cleanCluster, mode: 'insensitive' } },
              { clusterCode: { contains: cleanCluster, mode: 'insensitive' } },
            ],
          };
        }

        if (search.trim()) {
          const q = search.trim();
          whereClause.OR = [
            { fullName: { contains: q, mode: 'insensitive' } },
            { siaNumber: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
          ];
        }

        const customers = await prisma.customer.findMany({
          where: whereClause,
          include: {
            cluster: true,
            splitter: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: DEFAULT_CUSTOMER_LIST_LIMIT,
        });

        if (customers.length > 0) {
          return customers.map((c) => {
            const parsed = parseCustomerAddress(c.address);
            return {
              id: c.id,
              siaNumber: c.siaNumber,
              fullName: c.fullName,
              address: c.address,
              lat: c.lat ? Number(c.lat) : undefined,
              lng: c.lng ? Number(c.lng) : undefined,
              kecamatan: parsed.kecamatan,
              kelurahan: parsed.kelurahan,
              street: parsed.street,
              cluster: c.cluster?.name || 'Bandung Utara',
              clusterCode: c.cluster?.clusterCode || 'BDG-01',
              splitterCode: c.splitter?.splitterCode || 'ODP-BDG-01',
              portNumber: c.portNumber || 1,
              currentAttenuation: c.currentAttenuation ? Number(c.currentAttenuation) : -18.5,
              status: c.status,
              updatedAt: c.updatedAt.toISOString(),
            };
          });
        }
      } catch (err) {
        markDatabaseUnavailable(err);
        console.warn('[CustomerService] DB query failed, using fallback:', (err as Error).message);
      }
    }

    // Graceful fallback
    let fallback = [...FALLBACK_CUSTOMERS];
    if (cluster && cluster !== 'Semua cluster') {
      fallback = fallback.filter((c) => c.cluster.includes(cluster.replace('Bandung ', '')));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      fallback = fallback.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.siaNumber.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q),
      );
    }
    return fallback;
  }

  /**
   * Retrieves single customer details by SIA number including recent attenuation histories.
   */
  public static async getCustomerBySia(siaNumber: string) {
    if (await isDatabaseAvailable()) {
      try {
        const customer = await prisma.customer.findUnique({
          where: { siaNumber },
          include: {
            cluster: true,
            splitter: true,
            attenuations: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: { tech: true },
            },
          },
        });

        if (customer) {
          return {
            customer: {
              id: customer.id,
              siaNumber: customer.siaNumber,
              fullName: customer.fullName,
              address: customer.address,
              lat: customer.lat ? Number(customer.lat) : undefined,
              lng: customer.lng ? Number(customer.lng) : undefined,
              cluster: customer.cluster?.name || 'Bandung Utara',
              clusterCode: customer.cluster?.clusterCode || 'BDG-01',
              splitterCode: customer.splitter?.splitterCode || 'ODP-BDG-01',
              portNumber: customer.portNumber || 1,
              currentAttenuation: customer.currentAttenuation
                ? Number(customer.currentAttenuation)
                : -18.5,
              status: customer.status,
              updatedAt: customer.updatedAt.toISOString(),
            },
            histories: customer.attenuations.map((h) => ({
              id: h.id,
              submissionId: h.submissionId,
              oldAttenuation: h.oldAttenuation ? Number(h.oldAttenuation) : null,
              newAttenuation: Number(h.newAttenuation),
              splitterCode: customer.splitter?.splitterCode || 'ODP-BDG-01',
              portNumber: h.portNumber,
              photoObjectKey: h.photoObjectKey,
              technicianName: h.tech?.fullName || 'Teknisi Lapangan',
              recordedAt: h.createdAt.toISOString(),
            })),
          };
        }
      } catch (err) {
        markDatabaseUnavailable(err);
        console.warn(
          '[CustomerService] DB getCustomerBySia failed, using fallback:',
          (err as Error).message,
        );
      }
    }

    const fallbackCust = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === siaNumber);
    if (!fallbackCust) {
      throw new Error(`Pelanggan dengan nomor SIA ${siaNumber} tidak ditemukan`);
    }

    return {
      customer: fallbackCust,
      histories: [
        {
          id: 'hist-1',
          submissionId: 'sub-demo-1',
          oldAttenuation: -21.0,
          newAttenuation: fallbackCust.currentAttenuation,
          splitterCode: fallbackCust.splitterCode,
          portNumber: fallbackCust.portNumber,
          photoObjectKey: 'proofs/demo_proof.jpg',
          technicianName: 'Andi Pratama',
          recordedAt: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Mutates customer splitter port with concurrency checks and append-only audit logging.
   */
  public static async mutateSplitterPort(
    siaNumber: string,
    newSplitterCode: string,
    newPortNumber: number,
    actorId = 'superadmin',
  ) {
    if (await isDatabaseAvailable()) {
      try {
        return await prisma.$transaction(async (tx) => {
          const customer = await tx.customer.findUnique({
            where: { siaNumber },
            include: { splitter: true },
          });

          if (!customer) {
            throw new Error(`Pelanggan dengan SIA ${siaNumber} tidak ditemukan`);
          }

          const targetSplitter = await tx.networkSplitter.findFirst({
            where: {
              OR: [{ id: newSplitterCode }, { splitterCode: newSplitterCode }],
            },
          });

          if (!targetSplitter) {
            throw new Error(`ODP Splitter ${newSplitterCode} tidak ditemukan`);
          }

          if (newPortNumber > targetSplitter.maxPorts) {
            throw new Error(
              `Nomor port ${newPortNumber} melebihi batas kapasitas ODP (${targetSplitter.maxPorts} port)`,
            );
          }

          // Port concurrency validation (Law 1)
          const occupied = await tx.customer.findFirst({
            where: {
              splitterId: targetSplitter.id,
              portNumber: newPortNumber,
              status: 'ACTIVE',
              id: { not: customer.id },
            },
          });

          if (occupied) {
            throw new Error(
              `${ERROR_CODES.PORT_OCCUPIED}: Port ${newPortNumber} pada ${targetSplitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`,
            );
          }

          const oldSplitterCode = customer.splitter?.splitterCode || null;
          const oldPortNumber = customer.portNumber;

          // Update customer port
          const updated = await tx.customer.update({
            where: { id: customer.id },
            data: {
              splitterId: targetSplitter.id,
              portNumber: newPortNumber,
              updatedAt: new Date(),
            },
            include: { cluster: true, splitter: true },
          });

          // Append-Only Activity Log (Law 2)
          await tx.activityLog.create({
            data: {
              actorUserId: actorId,
              actorRole: 'Admin',
              actionType: 'CUSTOMER_PORT_MUTATED',
              targetEntity: 'customer',
              targetId: customer.id,
              oldPayload: {
                splitterCode: oldSplitterCode,
                portNumber: oldPortNumber,
              },
              newPayload: {
                splitterCode: targetSplitter.splitterCode,
                portNumber: newPortNumber,
              },
            },
          });

          return {
            id: updated.id,
            siaNumber: updated.siaNumber,
            fullName: updated.fullName,
            address: updated.address,
            cluster: updated.cluster?.name || 'Cluster',
            clusterCode: updated.cluster?.clusterCode || 'BDG-01',
            splitterCode: updated.splitter?.splitterCode || newSplitterCode,
            portNumber: updated.portNumber || newPortNumber,
            currentAttenuation: updated.currentAttenuation
              ? Number(updated.currentAttenuation)
              : -18.5,
            status: updated.status,
            updatedAt: updated.updatedAt.toISOString(),
          };
        });
      } catch (err) {
        if (
          (err as Error).message.includes(ERROR_CODES.PORT_OCCUPIED) ||
          (err as Error).message.includes('kapasitas')
        ) {
          throw err;
        }
        markDatabaseUnavailable(err);
        console.warn('[CustomerService] DB mutate failed:', (err as Error).message);
        throw err;
      }
    }

    // Fallback memory mutation when DB is offline
    const customer = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === siaNumber);
    if (!customer) {
      throw new Error(`Pelanggan dengan SIA ${siaNumber} tidak ditemukan`);
    }
    const conflict = FALLBACK_CUSTOMERS.find(
      (c) =>
        c.splitterCode === newSplitterCode &&
        c.portNumber === newPortNumber &&
        c.status === 'ACTIVE' &&
        c.siaNumber !== siaNumber,
    );
    if (conflict) {
      throw new Error(
        `${ERROR_CODES.PORT_OCCUPIED}: Port ${newPortNumber} pada ${newSplitterCode} sudah digunakan oleh pelanggan aktif (${conflict.fullName} - ${conflict.siaNumber}).`,
      );
    }
    customer.splitterCode = newSplitterCode;
    customer.portNumber = newPortNumber;
    customer.updatedAt = new Date().toISOString();
    return customer;
  }

  /**
   * Registers a new customer (SIA) in Master Data with optional splitter/port allocation and audit log.
   */
  public static async createCustomer(
    input: CreateCustomerInput,
    actor: UserSessionContext,
  ): Promise<CustomerListItem> {
    const siaNumber = input.siaNumber.toUpperCase();

    if (await isDatabaseAvailable()) {
      try {
        const dup = await prisma.customer.findUnique({ where: { siaNumber } });
        if (dup) {
          throw new Error(`Pelanggan dengan SIA "${siaNumber}" sudah terdaftar.`);
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
          throw new Error(`Cluster "${input.clusterCode}" tidak ditemukan.`);
        }

        const created = await prisma.$transaction(async (tx) => {
          let splitterId: string | null = null;
          let resolvedSplitterCode = 'Belum dialokasi';
          if (input.splitterCode) {
            const sp = await tx.networkSplitter.findFirst({
              where: { splitterCode: { equals: input.splitterCode, mode: 'insensitive' } },
            });
            if (!sp) {
              throw new Error(`ODP Splitter "${input.splitterCode}" tidak ditemukan.`);
            }
            if (input.portNumber && input.status === 'ACTIVE') {
              if (input.portNumber > sp.maxPorts) {
                throw new Error(`Nomor port melebihi kapasitas ${sp.maxPorts} port.`);
              }
              const conflict = await tx.customer.findFirst({
                where: { splitterId: sp.id, portNumber: input.portNumber, status: 'ACTIVE' },
              });
              if (conflict) {
                throw new Error(
                  `${ERROR_CODES.PORT_OCCUPIED}: Port ${input.portNumber} pada ${sp.splitterCode} sudah terisi (${conflict.siaNumber}).`,
                );
              }
            }
            splitterId = sp.id;
            resolvedSplitterCode = sp.splitterCode;
          }

          const customer = await tx.customer.create({
            data: {
              siaNumber,
              fullName: input.fullName,
              address: input.address,
              lat: input.lat ?? null,
              lng: input.lng ?? null,
              clusterId: cluster.id,
              splitterId,
              portNumber: input.portNumber ?? null,
              status: input.status,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'CUSTOMER_CREATED',
              targetEntity: 'customer',
              targetId: customer.id,
              newPayload: {
                siaNumber,
                fullName: input.fullName,
                clusterCode: cluster.clusterCode,
                splitterCode: resolvedSplitterCode,
                portNumber: input.portNumber ?? null,
                status: input.status,
              } as Prisma.InputJsonValue,
            },
          });

          return { customer, resolvedSplitterCode };
        });

        const parsed = parseCustomerAddress(created.customer.address);
        return {
          id: created.customer.id,
          siaNumber: created.customer.siaNumber,
          fullName: created.customer.fullName,
          address: created.customer.address,
          lat: created.customer.lat ? Number(created.customer.lat) : input.lat,
          lng: created.customer.lng ? Number(created.customer.lng) : input.lng,
          kecamatan: parsed.kecamatan,
          kelurahan: parsed.kelurahan,
          street: parsed.street,
          cluster: cluster.name,
          clusterCode: cluster.clusterCode,
          splitterCode: created.resolvedSplitterCode,
          portNumber: created.customer.portNumber ?? 0,
          currentAttenuation: -18.5,
          status: created.customer.status,
          updatedAt: created.customer.updatedAt.toISOString(),
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes('sudah terdaftar') ||
            err.message.includes('tidak ditemukan') ||
            err.message.includes(ERROR_CODES.PORT_OCCUPIED) ||
            err.message.includes('melebihi'))
        ) {
          throw err;
        }
        markDatabaseUnavailable(err);
      }
    }

    if (FALLBACK_CUSTOMERS.some((c) => c.siaNumber.toUpperCase() === siaNumber)) {
      throw new Error(`Pelanggan dengan SIA "${siaNumber}" sudah terdaftar.`);
    }

    const parsed = parseCustomerAddress(input.address);
    const newItem: CustomerListItem = {
      id: `cust-${Date.now()}`,
      siaNumber,
      fullName: input.fullName,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      kecamatan: parsed.kecamatan,
      kelurahan: parsed.kelurahan,
      street: parsed.street,
      cluster: input.clusterCode.includes('Bandung') || input.clusterCode.includes('Cimahi') || input.clusterCode.includes('Rancaekek')
        ? input.clusterCode
        : 'Bandung Utara',
      clusterCode: input.clusterCode.toUpperCase().startsWith('BDG') || input.clusterCode.toUpperCase().startsWith('CL')
        ? input.clusterCode.toUpperCase()
        : 'BDG-01',
      splitterCode: input.splitterCode || 'ODP-BDG-01',
      portNumber: input.portNumber ?? 0,
      currentAttenuation: -18.5,
      status: input.status,
      updatedAt: new Date().toISOString(),
    };
    FALLBACK_CUSTOMERS.unshift(newItem);
    return newItem;
  }

  /**
   * Updates customer master details or service lifecycle status (ACTIVE / ISOLATED / DISMANTLED).
   */
  public static async updateCustomer(
    input: UpdateCustomerInput,
    actor: UserSessionContext,
  ): Promise<CustomerListItem> {
    if (await isDatabaseAvailable()) {
      try {
        const existing = await prisma.customer.findUnique({
          where: { siaNumber: input.siaNumber },
          include: { cluster: true, splitter: true },
        });
        if (!existing) {
          throw new Error(`Pelanggan dengan SIA "${input.siaNumber}" tidak ditemukan.`);
        }

        const shouldReleasePort = input.status === 'DISMANTLED';
        const updated = await prisma.$transaction(async (tx) => {
          const next = await tx.customer.update({
            where: { id: existing.id },
            data: {
              fullName: input.fullName ?? existing.fullName,
              address: input.address ?? existing.address,
              lat: input.lat ?? existing.lat,
              lng: input.lng ?? existing.lng,
              status: input.status ?? existing.status,
              splitterId: shouldReleasePort ? null : existing.splitterId,
              portNumber: shouldReleasePort ? null : existing.portNumber,
            },
            include: { cluster: true, splitter: true },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'CUSTOMER_UPDATED',
              targetEntity: 'customer',
              targetId: existing.id,
              oldPayload: {
                fullName: existing.fullName,
                address: existing.address,
                status: existing.status,
              } as Prisma.InputJsonValue,
              newPayload: {
                fullName: next.fullName,
                address: next.address,
                status: next.status,
              } as Prisma.InputJsonValue,
            },
          });

          return next;
        });

        const parsed = parseCustomerAddress(updated.address);
        return {
          id: updated.id,
          siaNumber: updated.siaNumber,
          fullName: updated.fullName,
          address: updated.address,
          kecamatan: parsed.kecamatan,
          kelurahan: parsed.kelurahan,
          street: parsed.street,
          cluster: updated.cluster?.name || 'Bandung Utara',
          clusterCode: updated.cluster?.clusterCode || 'BDG-01',
          splitterCode: updated.splitter?.splitterCode || 'Belum dialokasi',
          portNumber: updated.portNumber ?? 0,
          currentAttenuation: updated.currentAttenuation ? Number(updated.currentAttenuation) : -18.5,
          status: updated.status,
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        if (err instanceof Error && err.message.includes('tidak ditemukan')) {
          throw err;
        }
        markDatabaseUnavailable(err);
      }
    }

    const fallback = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === input.siaNumber);
    if (!fallback) {
      throw new Error(`Pelanggan dengan SIA "${input.siaNumber}" tidak ditemukan.`);
    }
    if (input.fullName) fallback.fullName = input.fullName;
    if (input.address) {
      fallback.address = input.address;
      const p = parseCustomerAddress(input.address);
      fallback.street = p.street;
      fallback.kelurahan = p.kelurahan;
      fallback.kecamatan = p.kecamatan;
    }
    if (input.lat !== undefined) fallback.lat = input.lat;
    if (input.lng !== undefined) fallback.lng = input.lng;
    if (input.status) {
      fallback.status = input.status;
      if (input.status === 'DISMANTLED') fallback.portNumber = 0;
    }
    fallback.updatedAt = new Date().toISOString();
    return fallback;
  }

  /**
   * Registers a fallback customer entry when CS creates a new PSB ticket offline.
   */
  public static ensureFallbackCustomer(params: {
    siaNumber: string;
    fullName: string;
    address: string;
    lat?: number;
    lng?: number;
    clusterName: string;
    clusterCode: string;
  }): CustomerListItem {
    const existing = FALLBACK_CUSTOMERS.find(
      (c) => c.siaNumber.toUpperCase() === params.siaNumber.toUpperCase(),
    );
    if (existing) {
      return existing;
    }
    const parsed = parseCustomerAddress(params.address);
    const created: CustomerListItem = {
      id: `cust-${Date.now()}`,
      siaNumber: params.siaNumber,
      fullName: params.fullName,
      address: params.address,
      lat: params.lat,
      lng: params.lng,
      kecamatan: parsed.kecamatan,
      kelurahan: parsed.kelurahan,
      street: parsed.street,
      cluster: params.clusterName,
      clusterCode: params.clusterCode,
      splitterCode: 'Belum dialokasi',
      portNumber: 0,
      currentAttenuation: -20.0,
      status: 'PENDING_INSTALL',
      updatedAt: new Date().toISOString(),
    };
    FALLBACK_CUSTOMERS.unshift(created);
    return created;
  }

  /**
   * Updates customer master data in fallback store upon Super Admin approval (Law 1 & 2).
   */
  public static updateCustomerFromApproval(
    siaNumber: string,
    update: {
      status?: string;
      splitterCode?: string;
      portNumber?: number;
      currentAttenuation?: number;
    },
  ): void {
    const customer = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === siaNumber);
    if (customer) {
      if (update.status) customer.status = update.status;
      if (update.splitterCode) customer.splitterCode = update.splitterCode;
      if (update.portNumber !== undefined) customer.portNumber = update.portNumber;
      if (update.currentAttenuation !== undefined)
        customer.currentAttenuation = update.currentAttenuation;
      customer.updatedAt = new Date().toISOString();
    }
  }
}
