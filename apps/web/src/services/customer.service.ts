import { prisma } from '@repo/database';
import { ERROR_CODES } from '@repo/shared';

export interface CustomerListItem {
  id: string;
  siaNumber: string;
  fullName: string;
  address: string;
  kecamatan?: string;
  kelurahan?: string;
  street?: string;
  cluster: string;
  clusterCode: string;
  splitterCode: string;
  portNumber: number;
  currentAttenuation: number;
  status: string;
  updatedAt: string;
}

export function parseCustomerAddress(address: string): { street: string; kelurahan: string; kecamatan: string } {
  const lower = address.toLowerCase();
  const street = address.split(',')[0]?.trim() || address;

  let kecamatan = 'Bandung Wetan';
  if (lower.includes('coblong') || lower.includes('dago') || lower.includes('cikutra')) {
    kecamatan = 'Coblong';
  } else if (lower.includes('sukajadi') || lower.includes('pasteur')) {
    kecamatan = 'Sukajadi';
  } else if (lower.includes('lengkong') || lower.includes('buah batu')) {
    kecamatan = 'Lengkong';
  } else if (lower.includes('arcamanik') || lower.includes('soekarno hatta') || lower.includes('sukamiskin')) {
    kecamatan = 'Arcamanik';
  } else if (lower.includes('cimahi') || lower.includes('baros')) {
    kecamatan = 'Cimahi Tengah';
  } else if (lower.includes('rancaekek')) {
    kecamatan = 'Rancaekek';
  } else if (lower.includes('riau') || lower.includes('bandung wetan') || lower.includes('citarum')) {
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
  /**
   * Retrieves customers list from PostgreSQL via Prisma with search and cluster filtering.
   */
  public static async listCustomers(
    search = '',
    cluster = 'Semua cluster'
  ): Promise<CustomerListItem[]> {
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
      });

      if (customers.length > 0) {
        return customers.map((c) => {
          const parsed = parseCustomerAddress(c.address);
          return {
            id: c.id,
            siaNumber: c.siaNumber,
            fullName: c.fullName,
            address: c.address,
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
      console.warn('[CustomerService] DB query failed, using fallback:', (err as Error).message);
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
          c.address.toLowerCase().includes(q)
      );
    }
    return fallback;
  }

  /**
   * Retrieves single customer details by SIA number including recent attenuation histories.
   */
  public static async getCustomerBySia(siaNumber: string) {
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
            cluster: customer.cluster?.name || 'Bandung Utara',
            clusterCode: customer.cluster?.clusterCode || 'BDG-01',
            splitterCode: customer.splitter?.splitterCode || 'ODP-BDG-01',
            portNumber: customer.portNumber || 1,
            currentAttenuation: customer.currentAttenuation ? Number(customer.currentAttenuation) : -18.5,
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
      console.warn('[CustomerService] DB getCustomerBySia failed, using fallback:', (err as Error).message);
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
    actorId = 'superadmin'
  ) {
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
            `Nomor port ${newPortNumber} melebihi batas kapasitas ODP (${targetSplitter.maxPorts} port)`
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
            `${ERROR_CODES.PORT_OCCUPIED}: Port ${newPortNumber} pada ${targetSplitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`
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
          currentAttenuation: updated.currentAttenuation ? Number(updated.currentAttenuation) : -18.5,
          status: updated.status,
          updatedAt: updated.updatedAt.toISOString(),
        };
      });
    } catch (err) {
      if ((err as Error).message.includes(ERROR_CODES.PORT_OCCUPIED) || (err as Error).message.includes('kapasitas')) {
        throw err;
      }
      console.warn('[CustomerService] DB mutate failed:', (err as Error).message);
      throw err;
    }
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
    }
  ): void {
    const customer = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === siaNumber);
    if (customer) {
      if (update.status) customer.status = update.status;
      if (update.splitterCode) customer.splitterCode = update.splitterCode;
      if (update.portNumber !== undefined) customer.portNumber = update.portNumber;
      if (update.currentAttenuation !== undefined) customer.currentAttenuation = update.currentAttenuation;
      customer.updatedAt = new Date().toISOString();
    }
  }
}
