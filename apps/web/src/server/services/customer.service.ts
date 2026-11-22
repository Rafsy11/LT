import { prisma, Prisma } from '@repo/database';
import {
  ERROR_CODES,
  type CustomerListItem,
  type CustomerProfileDetail,
  type CustomerRecentTicket,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type UserSessionContext,
} from '@repo/shared';
import { AuthHttpError, matchesAssignedClusters } from '../lib/admin-auth';
import {
  isStrictLiveMode,
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
} from '../lib/live-data';
import { minioManager } from '../lib/minio';
import { withSplitterPortMutex } from '../lib/port-mutex';

const DEFAULT_CUSTOMER_LIST_LIMIT = 1000;

async function resolvePhotoUrl(photoObjectKey: string | null | undefined): Promise<string | null> {
  if (!photoObjectKey) return null;
  if (photoObjectKey.startsWith('/assets/')) {
    return photoObjectKey;
  }
  try {
    return await minioManager.generatePresignedGetUrl(photoObjectKey);
  } catch {
    return null;
  }
}

export type { CustomerListItem };

export function parseCustomerAddress(address: string): {
  street: string;
  kelurahan: string;
  kecamatan: string;
} {
  const lower = address.toLowerCase();
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const street = parts[0] || address;

  let kecamatan = '-';
  let kelurahan = '-';

  // Palembang landmarks and sub-districts
  if (
    lower.includes('h. r. agam') ||
    lower.includes('ps mall') ||
    lower.includes('palembang square') ||
    lower.includes('ilir barat') ||
    lower.includes('lorok pakjo') ||
    lower.includes('bukit kecil')
  ) {
    kecamatan = 'Ilir Barat I';
    kelurahan = 'Lorok Pakjo';
  } else if (
    lower.includes('basuki rahmat') ||
    lower.includes('polda') ||
    lower.includes('kemuning') ||
    lower.includes('pipa reja') ||
    lower.includes('sekip')
  ) {
    kecamatan = 'Kemuning';
    kelurahan = 'Pipa Reja';
  } else if (
    lower.includes('kebun bunga') ||
    lower.includes('sukarami') ||
    lower.includes('bandara') ||
    lower.includes('km')
  ) {
    kecamatan = 'Sukarami';
    kelurahan = 'Kebun Bunga';
  } else if (
    lower.includes('kenten') ||
    lower.includes('sako') ||
    lower.includes('ilir timur') ||
    lower.includes('musi raya')
  ) {
    kecamatan = 'Sako';
    kelurahan = 'Kenten';
  } else if (lower.includes('palembang')) {
    kecamatan = 'Ilir Barat I';
    kelurahan = 'Demang Lebar Daun';
  } else if (lower.includes('coblong') || lower.includes('dago') || lower.includes('cikutra')) {
    kecamatan = 'Coblong';
    kelurahan = lower.includes('dago') ? 'Dago' : 'Sadangserang';
  } else if (lower.includes('sukajadi') || lower.includes('pasteur')) {
    kecamatan = 'Sukajadi';
    kelurahan = 'Pasteur';
  } else if (lower.includes('lengkong') || lower.includes('buah batu')) {
    kecamatan = 'Lengkong';
    kelurahan = 'Malabar';
  } else if (
    lower.includes('arcamanik') ||
    lower.includes('soekarno hatta') ||
    lower.includes('sukamiskin')
  ) {
    kecamatan = 'Arcamanik';
    kelurahan = 'Sukamiskin';
  } else if (lower.includes('cimahi') || lower.includes('baros')) {
    kecamatan = 'Cimahi Tengah';
    kelurahan = 'Baros';
  } else if (lower.includes('rancaekek')) {
    kecamatan = 'Rancaekek';
    kelurahan = 'Rancaekek Kencana';
  } else if (
    lower.includes('riau') ||
    lower.includes('bandung wetan') ||
    lower.includes('citarum')
  ) {
    kecamatan = 'Bandung Wetan';
    kelurahan = 'Citarum';
  } else if (lower.includes('bandung')) {
    kecamatan = 'Bandung Wetan';
    kelurahan = 'Citarum';
  } else {
    // Graceful fallback for non-Bandung generic addresses
    kecamatan = parts[2]?.replace(/^kec\.?\s*/i, '') || parts[1] || 'Umum';
    kelurahan = parts[1]?.replace(/^kel\.?\s*/i, '') || parts[0] || 'Umum';
  }

  return { street, kelurahan, kecamatan };
}

// Fallback seed data if DB is temporarily empty during build/initialization
const FALLBACK_CUSTOMERS: CustomerListItem[] = [
  {
    id: 'cust-1',
    siaNumber: '2025468390',
    fullName: 'MAP AKTIF ADIPERKASA (SPORTS STATION PS)',
    address: 'Area ODP rooftop PS Mall, Palembang',
    lat: -2.97638,
    lng: 104.74148,
    kecamatan: 'Ilir Barat I',
    kelurahan: 'Lorok Pakjo',
    street: 'Palembang Square Mall Lt. 2',
    cluster: 'Palembang H. R. Agam',
    clusterCode: 'PLBHRAGA01',
    splitterCode: 'ODP-PLB-001',
    portNumber: 1,
    currentAttenuation: -25.8,
    status: 'ACTIVE',
    gponNode: 'PLBHRAGA01',
    oltSlot: '2@1/7/3.gpon',
    ontSn: 'rcmginds183',
    notes: 'ODP rooftop PS Mall',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-2',
    siaNumber: '2025468388',
    fullName: 'MAP AKTIF ADIPERKASA (SKECHERS PS)',
    address: 'Area ODP rooftop PS Mall, Palembang',
    lat: -2.97638,
    lng: 104.74148,
    kecamatan: 'Ilir Barat I',
    kelurahan: 'Lorok Pakjo',
    street: 'Palembang Square Mall Lt. 1',
    cluster: 'Palembang H. R. Agam',
    clusterCode: 'PLBHRAGA01',
    splitterCode: 'ODP-PLB-001',
    portNumber: 3,
    currentAttenuation: -25.3,
    status: 'ACTIVE',
    gponNode: 'PLBHRAGA01',
    oltSlot: '3@1/7/3.gpon',
    ontSn: 'rcmgd84921',
    notes: 'ODP rooftop PS Mall',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-3',
    siaNumber: '2023352738',
    fullName: 'BANK MANDIRI KC PALEMBANG',
    address: 'Area ODP BASUKI RAHMAT, Palembang',
    lat: -2.976546,
    lng: 104.751214,
    kecamatan: 'Kemuning',
    kelurahan: 'Pipa Reja',
    street: 'Jl. Basuki Rahmat No. 12',
    cluster: 'Palembang Basuki Rahmat',
    clusterCode: 'PLBBSGGA01',
    splitterCode: 'ODP-PLB-010',
    portNumber: 2,
    currentAttenuation: -21.4,
    status: 'ACTIVE',
    gponNode: 'PLBBSGGA01',
    oltSlot: '1@1/1/2.gpon',
    ontSn: 'ALCLB1234567',
    notes: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-4',
    siaNumber: '2024411707',
    fullName: 'BANK SINARMAS KM12',
    address: 'Area ODP KM12, Palembang',
    lat: -2.914267,
    lng: 104.723914,
    kecamatan: 'Sukarami',
    kelurahan: 'Kebun Bunga',
    street: 'Jl. Kol. H. Burlian KM 12',
    cluster: 'Palembang Kebun Bunga',
    clusterCode: 'PLBKBNGR01',
    splitterCode: 'ODP-PLB-045',
    portNumber: 4,
    currentAttenuation: -19.5,
    status: 'ACTIVE',
    gponNode: 'PLBKBNGR01',
    oltSlot: '4@1/2/1.gpon',
    ontSn: 'ZTEGC9876543',
    notes: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-5',
    siaNumber: '2024417021',
    fullName: 'INDOSAT OOREDOO HUTCHISON',
    address: 'Area ODP JALAN MUSI RAYA, Palembang',
    lat: -2.954798,
    lng: 104.771168,
    kecamatan: 'Sako',
    kelurahan: 'Kenten',
    street: 'Jl. Musi Raya No. 45',
    cluster: 'Palembang Kenten',
    clusterCode: 'PLBTKEGR01',
    splitterCode: 'ODP-PLB-072',
    portNumber: 1,
    currentAttenuation: -22.1,
    status: 'ACTIVE',
    gponNode: 'PLBTKEGR01',
    oltSlot: '2@1/4/2.gpon',
    ontSn: 'HWTC00112233',
    notes: null,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cust-6',
    siaNumber: '2025501000',
    fullName: 'PT. LINTASARTA OUTLIER JAKARTA',
    address: 'Area Palembang, Luar Wilayah Sumsel',
    lat: -6.0886666,
    lng: 106.7596435,
    kecamatan: 'Umum',
    kelurahan: 'Umum',
    street: 'Jl. Daan Mogot No. 100',
    cluster: 'Palembang H. R. Agam',
    clusterCode: 'PLBHRAGA01',
    splitterCode: null,
    portNumber: null,
    currentAttenuation: null,
    status: 'PENDING_INSTALL',
    gponNode: 'PLBHRAGA01',
    oltSlot: null,
    ontSn: null,
    notes: '[Koordinat Luar Sumsel]',
    updatedAt: new Date().toISOString(),
  },
];

export class CustomerService {
  public static async getCustomerCount(): Promise<number> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk menghitung pelanggan.')) {
      try {
        const count = await prisma.customer.count();
        if (isStrictLiveMode() || count > 0) return count;
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal membaca jumlah pelanggan dari PostgreSQL.');
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
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat data pelanggan.')) {
      try {
        const whereClause: Record<string, unknown> = {};

        if (cluster && cluster !== 'Semua cluster') {
          const cleanCluster = cluster.replace(/^(?:Bandung|Palembang)\s+/i, '').trim();
          whereClause.cluster = {
            OR: [
              { name: { contains: cleanCluster, mode: 'insensitive' } },
              { clusterCode: { contains: cleanCluster, mode: 'insensitive' } },
              { name: { contains: cluster.trim(), mode: 'insensitive' } },
              { clusterCode: { contains: cluster.trim(), mode: 'insensitive' } },
            ],
          };
        }

        if (search.trim()) {
          const q = search.trim();
          whereClause.OR = [
            { fullName: { contains: q, mode: 'insensitive' } },
            { siaNumber: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
            { picName: { contains: q, mode: 'insensitive' } },
            { picPhone: { contains: q, mode: 'insensitive' } },
            { splitter: { is: { splitterCode: { contains: q, mode: 'insensitive' } } } },
            { splitter: { is: { name: { contains: q, mode: 'insensitive' } } } },
          ];
        }

        const customers = await prisma.customer.findMany({
          where: whereClause,
          include: {
            cluster: true,
            splitter: true,
            tickets: {
              where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { ticketNumber: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: DEFAULT_CUSTOMER_LIST_LIMIT,
        });

        if (isStrictLiveMode() || customers.length > 0) {
          return await Promise.all(
            customers.map(async (c) => {
              const parsed = parseCustomerAddress(c.address);
              const photoUrl = await resolvePhotoUrl(c.photoObjectKey);
              const currentAtt =
                c.currentAttenuation != null ? Number(c.currentAttenuation) : null;
              const oltAtt = c.oltAttenuation != null ? Number(c.oltAttenuation) : null;
              const ontAtt = c.ontAttenuation != null ? Number(c.ontAttenuation) : currentAtt;

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
                cluster: c.cluster?.name || 'Palembang H. R. Agam',
                clusterCode: c.cluster?.clusterCode || 'PLBHRAGA01',
                splitterCode: c.splitter?.splitterCode ?? null,
                splitterName: c.splitter?.name ?? null,
                odpLat: c.splitter?.lat ? Number(c.splitter.lat) : null,
                odpLng: c.splitter?.lng ? Number(c.splitter.lng) : null,
                portNumber: c.portNumber ?? null,
                currentAttenuation: currentAtt,
                oltAttenuation: oltAtt,
                ontAttenuation: ontAtt,
                status: c.status,
                picName: c.picName ?? null,
                picPhone: c.picPhone ?? null,
                picRole: c.picRole ?? null,
                profileDescription: c.profileDescription ?? null,
                photoObjectKey: c.photoObjectKey ?? null,
                photoUrl,
                photoCaption: c.photoCaption ?? null,
                lastActivityNote: c.lastActivityNote ?? null,
                openTicketNumber: c.tickets[0]?.ticketNumber ?? null,
                gponNode: c.gponNode ?? null,
                oltSlot: c.oltSlot ?? null,
                ontSn: c.ontSn ?? null,
                notes: c.notes ?? null,
                updatedAt: c.updatedAt.toISOString(),
              };
            }),
          );
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal memuat daftar pelanggan dari PostgreSQL.');
      }
    }

    // Graceful fallback
    let fallback = [...FALLBACK_CUSTOMERS];
    if (cluster && cluster !== 'Semua cluster') {
      const clean = cluster.replace(/^(?:Bandung|Palembang)\s+/i, '').trim().toLowerCase();
      fallback = fallback.filter(
        (c) =>
          c.cluster.toLowerCase().includes(clean) ||
          (c.clusterCode && c.clusterCode.toLowerCase().includes(clean)),
      );
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
   * Retrieves single customer profile details by SIA number including PIC, ODP coordinates,
   * OLT/ONT attenuation, last activity note, open/recent 4 tickets, and attenuation histories.
   */
  public static async getCustomerBySia(siaNumber: string): Promise<CustomerProfileDetail> {
    if (await requireLiveDatabase('Database PostgreSQL diperlukan untuk membaca detail pelanggan.')) {
      try {
        const customer = await prisma.customer.findUnique({
          where: { siaNumber },
          include: {
            cluster: true,
            splitter: true,
            tickets: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: {
                assignedTech: { select: { fullName: true } },
              },
            },
            attenuations: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: { tech: true },
            },
          },
        });

        if (customer) {
          const parsed = parseCustomerAddress(customer.address);
          const photoUrl = await resolvePhotoUrl(customer.photoObjectKey);
          const mappedTickets: CustomerRecentTicket[] = customer.tickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            ticketType: t.ticketType,
            status: t.status,
            complaintSummary: t.complaintSummary ?? null,
            adminNotes: t.adminNotes ?? null,
            assignedTech: t.assignedTech?.fullName ?? t.vendorName ?? null,
            createdAt: t.createdAt.toISOString(),
            completedAt: t.completedAt ? t.completedAt.toISOString() : null,
          }));
          const openTicket =
            mappedTickets.find(
              (t) =>
                t.status === 'OPEN' ||
                t.status === 'IN_PROGRESS' ||
                t.status === 'PENDING_APPROVAL',
            ) ?? null;
          const recentTickets = mappedTickets.slice(0, 4);

          const currentAtt =
            customer.currentAttenuation != null ? Number(customer.currentAttenuation) : null;
          const oltAtt =
            customer.oltAttenuation != null ? Number(customer.oltAttenuation) : null;
          const ontAtt =
            customer.ontAttenuation != null ? Number(customer.ontAttenuation) : currentAtt;

          return {
            customer: {
              id: customer.id,
              siaNumber: customer.siaNumber,
              fullName: customer.fullName,
              address: customer.address,
              lat: customer.lat ? Number(customer.lat) : undefined,
              lng: customer.lng ? Number(customer.lng) : undefined,
              kecamatan: parsed.kecamatan,
              kelurahan: parsed.kelurahan,
              street: parsed.street,
              cluster: customer.cluster?.name || '-',
              clusterCode: customer.cluster?.clusterCode || '-',
              splitterCode: customer.splitter?.splitterCode ?? null,
              splitterName: customer.splitter?.name ?? null,
              odpLat: customer.splitter?.lat ? Number(customer.splitter.lat) : null,
              odpLng: customer.splitter?.lng ? Number(customer.splitter.lng) : null,
              portNumber: customer.portNumber ?? null,
              currentAttenuation: currentAtt,
              oltAttenuation: oltAtt,
              ontAttenuation: ontAtt,
              status: customer.status,
              picName: customer.picName ?? null,
              picPhone: customer.picPhone ?? null,
              picRole: customer.picRole ?? null,
              profileDescription: customer.profileDescription ?? null,
              photoObjectKey: customer.photoObjectKey ?? null,
              photoUrl,
              photoCaption: customer.photoCaption ?? null,
              lastActivityNote:
                customer.lastActivityNote ??
                openTicket?.adminNotes ??
                openTicket?.complaintSummary ??
                customer.notes ??
                null,
              openTicketNumber: openTicket?.ticketNumber ?? null,
              gponNode: customer.gponNode ?? null,
              oltSlot: customer.oltSlot ?? null,
              ontSn: customer.ontSn ?? null,
              notes: customer.notes ?? null,
              updatedAt: customer.updatedAt.toISOString(),
            },
            openTicket,
            recentTickets,
            histories: customer.attenuations.map((h) => ({
              id: h.id,
              submissionId: h.submissionId,
              oldAttenuation: h.oldAttenuation ? Number(h.oldAttenuation) : null,
              newAttenuation: Number(h.newAttenuation),
              splitterCode: customer.splitter?.splitterCode || '-',
              portNumber: h.portNumber,
              photoObjectKey: h.photoObjectKey,
              technicianName: h.tech?.fullName || 'Teknisi Lapangan',
              recordedAt: h.createdAt.toISOString(),
            })),
          };
        }
        if (isStrictLiveMode()) {
          const notFound = new Error(
            `Pelanggan dengan nomor SIA ${siaNumber} tidak ditemukan`,
          ) as Error & { statusCode?: number };
          notFound.statusCode = 404;
          throw notFound;
        }
      } catch (err) {
        if ((err as Error).message.includes('tidak ditemukan')) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal membaca profil pelanggan dari PostgreSQL.');
      }
    }

    const fallbackCust = FALLBACK_CUSTOMERS.find((c) => c.siaNumber === siaNumber);
    if (!fallbackCust) {
      throw new Error(`Pelanggan dengan nomor SIA ${siaNumber} tidak ditemukan`);
    }

    return {
      customer: fallbackCust,
      openTicket: null,
      recentTickets: [],
      histories: [
        {
          id: 'hist-1',
          submissionId: 'sub-demo-1',
          oldAttenuation: -21.0,
          newAttenuation: fallbackCust.currentAttenuation ?? -21.0,
          splitterCode: fallbackCust.splitterCode || '-',
          portNumber: fallbackCust.portNumber ?? 1,
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
    actorContext?: UserSessionContext,
  ) {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memutasikan port.')) {
      try {
        return await withSplitterPortMutex(newSplitterCode, newPortNumber, async () =>
          prisma.$transaction(async (tx) => {
          const customer = await tx.customer.findUnique({
            where: { siaNumber },
            include: { cluster: true, splitter: true },
          });

          if (!customer) {
            throw new Error(`Pelanggan dengan SIA ${siaNumber} tidak ditemukan`);
          }

          const targetSplitter = await tx.networkSplitter.findFirst({
            where: {
              OR: [{ id: newSplitterCode }, { splitterCode: newSplitterCode }],
            },
            include: { cluster: true },
          });

          if (!targetSplitter) {
            throw new Error(`ODP Splitter ${newSplitterCode} tidak ditemukan`);
          }

          const customerClusterId = customer.clusterId ?? customer.cluster?.id ?? null;
          const targetClusterId = targetSplitter.clusterId ?? targetSplitter.cluster?.id ?? null;
          const customerClusterCode = customer.cluster?.clusterCode ?? null;
          const targetClusterCode = targetSplitter.cluster?.clusterCode ?? null;

          const idMismatch =
            Boolean(customerClusterId && targetClusterId) &&
            customerClusterId !== targetClusterId;
          const codeMismatch =
            Boolean(customerClusterCode && targetClusterCode) &&
            customerClusterCode!.toLowerCase() !== targetClusterCode!.toLowerCase();

          if (
            idMismatch ||
            codeMismatch ||
            (!customerClusterId && !customerClusterCode) ||
            (!targetClusterId && !targetClusterCode)
          ) {
            throw new AuthHttpError(
              403,
              ERROR_CODES.FORBIDDEN,
              'Akses ditolak: ODP Splitter tujuan berada di cluster yang berbeda dengan pelanggan.',
            );
          }

          if (
            actorContext &&
            !matchesAssignedClusters(
              actorContext,
              targetClusterCode,
              targetSplitter.cluster?.name,
              customerClusterCode,
              customer.cluster?.name,
            )
          ) {
            throw new AuthHttpError(
              403,
              ERROR_CODES.FORBIDDEN,
              'Akses ditolak: ODP Splitter tujuan berada di luar cakupan cluster Anda.',
            );
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
            clusterCode: updated.cluster?.clusterCode || 'PLBHRAGA01',
            splitterCode: updated.splitter?.splitterCode ?? (newSplitterCode || null),
            portNumber: updated.portNumber ?? newPortNumber,
            currentAttenuation: updated.currentAttenuation != null
              ? Number(updated.currentAttenuation)
              : null,
            status: updated.status,
            gponNode: updated.gponNode ?? null,
            oltSlot: updated.oltSlot ?? null,
            ontSn: updated.ontSn ?? null,
            notes: updated.notes ?? null,
            updatedAt: updated.updatedAt.toISOString(),
          };
        }));
      } catch (err) {
        if (err instanceof AuthHttpError) {
          throw err;
        }
        if (
          (err as Error).message.includes(ERROR_CODES.PORT_OCCUPIED) ||
          (err as Error).message.includes('kapasitas') ||
          (err as Error).message.includes('tidak ditemukan')
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui port pelanggan di PostgreSQL.');
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

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk membuat data pelanggan baru.')) {
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
        if (!matchesAssignedClusters(actor, cluster.clusterCode, cluster.name)) {
          throw new AuthHttpError(
            403,
            ERROR_CODES.FORBIDDEN,
            `Akses ditolak: Cluster "${cluster.clusterCode}" berada di luar cakupan Anda.`,
          );
        }

        const created = await prisma.$transaction(async (tx) => {
          let splitterId: string | null = null;
          let resolvedSplitterCode = 'Belum dialokasi';
          if (input.splitterCode) {
            const sp = await tx.networkSplitter.findFirst({
              where: { splitterCode: { equals: input.splitterCode, mode: 'insensitive' } },
              include: { cluster: true },
            });
            if (!sp) {
              throw new Error(`ODP Splitter "${input.splitterCode}" tidak ditemukan.`);
            }
            if (
              (sp.clusterId && sp.clusterId !== cluster.id) ||
              (sp.cluster?.clusterCode &&
                sp.cluster.clusterCode.toLowerCase() !== cluster.clusterCode.toLowerCase()) ||
              !matchesAssignedClusters(actor, sp.cluster?.clusterCode ?? cluster.clusterCode, sp.cluster?.name ?? cluster.name)
            ) {
              throw new AuthHttpError(
                403,
                ERROR_CODES.FORBIDDEN,
                'Akses ditolak: ODP Splitter harus berada pada cluster yang sama dengan pelanggan.',
              );
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

          const effectiveAttenuation =
            input.ontAttenuation ?? input.oltAttenuation ?? null;

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
              currentAttenuation: effectiveAttenuation,
              oltAttenuation: input.oltAttenuation ?? null,
              ontAttenuation: input.ontAttenuation ?? null,
              status: input.status,
              picName: input.picName ?? null,
              picPhone: input.picPhone ?? null,
              picRole: input.picRole ?? null,
              profileDescription: input.profileDescription ?? null,
              photoObjectKey: input.photoObjectKey ?? null,
              photoCaption: input.photoCaption ?? null,
              lastActivityNote: input.lastActivityNote ?? null,
              gponNode: input.gponNode ?? null,
              oltSlot: input.oltSlot ?? null,
              ontSn: input.ontSn ?? null,
              notes: input.notes ?? null,
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
                picName: input.picName ?? null,
              } as Prisma.InputJsonValue,
            },
          });

          return { customer, resolvedSplitterCode };
        });

        const parsed = parseCustomerAddress(created.customer.address);
        const photoUrl = await resolvePhotoUrl(created.customer.photoObjectKey);
        return {
          id: created.customer.id,
          siaNumber: created.customer.siaNumber,
          fullName: created.customer.fullName,
          address: created.customer.address,
          lat: created.customer.lat ? Number(created.customer.lat) : (input.lat ?? undefined),
          lng: created.customer.lng ? Number(created.customer.lng) : (input.lng ?? undefined),
          kecamatan: parsed.kecamatan,
          kelurahan: parsed.kelurahan,
          street: parsed.street,
          cluster: cluster.name,
          clusterCode: cluster.clusterCode,
          splitterCode: created.resolvedSplitterCode === 'Belum dialokasi' ? null : created.resolvedSplitterCode,
          portNumber: created.customer.portNumber ?? null,
          currentAttenuation:
            created.customer.currentAttenuation != null
              ? Number(created.customer.currentAttenuation)
              : null,
          oltAttenuation:
            created.customer.oltAttenuation != null
              ? Number(created.customer.oltAttenuation)
              : null,
          ontAttenuation:
            created.customer.ontAttenuation != null
              ? Number(created.customer.ontAttenuation)
              : null,
          status: created.customer.status,
          picName: created.customer.picName ?? null,
          picPhone: created.customer.picPhone ?? null,
          picRole: created.customer.picRole ?? null,
          profileDescription: created.customer.profileDescription ?? null,
          photoObjectKey: created.customer.photoObjectKey ?? null,
          photoUrl,
          photoCaption: created.customer.photoCaption ?? null,
          lastActivityNote: created.customer.lastActivityNote ?? null,
          gponNode: created.customer.gponNode ?? null,
          oltSlot: created.customer.oltSlot ?? null,
          ontSn: created.customer.ontSn ?? null,
          notes: created.customer.notes ?? null,
          updatedAt: created.customer.updatedAt.toISOString(),
        };
      } catch (err) {
        if (err instanceof AuthHttpError) {
          throw err;
        }
        if (
          err instanceof Error &&
          (err.message.includes('sudah terdaftar') ||
            err.message.includes('tidak ditemukan') ||
            err.message.includes(ERROR_CODES.PORT_OCCUPIED) ||
            err.message.includes('melebihi'))
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan pelanggan baru ke PostgreSQL.');
        if (isStrictLiveMode()) {
          throw err;
        }
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
      lat: input.lat ?? undefined,
      lng: input.lng ?? undefined,
      kecamatan: parsed.kecamatan,
      kelurahan: parsed.kelurahan,
      street: parsed.street,
      cluster: input.clusterCode,
      clusterCode: input.clusterCode.toUpperCase(),
      splitterCode: input.splitterCode || null,
      portNumber: input.portNumber ?? null,
      currentAttenuation: input.ontAttenuation ?? input.oltAttenuation ?? null,
      oltAttenuation: input.oltAttenuation ?? null,
      ontAttenuation: input.ontAttenuation ?? null,
      status: input.status,
      picName: input.picName ?? null,
      picPhone: input.picPhone ?? null,
      picRole: input.picRole ?? null,
      profileDescription: input.profileDescription ?? null,
      photoObjectKey: input.photoObjectKey ?? null,
      photoUrl: input.photoObjectKey ?? null,
      photoCaption: input.photoCaption ?? null,
      lastActivityNote: input.lastActivityNote ?? null,
      gponNode: input.gponNode ?? null,
      oltSlot: input.oltSlot ?? null,
      ontSn: input.ontSn ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    };
    FALLBACK_CUSTOMERS.unshift(newItem);
    return newItem;
  }

  /**
   * Updates complete customer profile details (SUPER_ADMIN only at API layer) with audit logging.
   */
  public static async updateCustomer(
    input: UpdateCustomerInput,
    actor: UserSessionContext,
  ): Promise<CustomerListItem> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memperbarui data pelanggan.')) {
      try {
        const existing = await prisma.customer.findUnique({
          where: { siaNumber: input.siaNumber },
          include: { cluster: true, splitter: true },
        });
        if (!existing) {
          throw new Error(`Pelanggan dengan SIA "${input.siaNumber}" tidak ditemukan.`);
        }
        if (!matchesAssignedClusters(actor, existing.cluster?.clusterCode, existing.cluster?.name)) {
          throw new AuthHttpError(
            403,
            ERROR_CODES.FORBIDDEN,
            'Akses ditolak: Data pelanggan berada di luar cakupan cluster Anda.',
          );
        }

        const nextStatus = input.status ?? existing.status;
        const shouldReleasePort = nextStatus === 'DISMANTLED';

        const updated = await prisma.$transaction(async (tx) => {
          let resolvedSplitterId: string | null = existing.splitterId;
          let resolvedPortNumber: number | null =
            input.portNumber !== undefined ? input.portNumber : existing.portNumber;

          if (shouldReleasePort) {
            resolvedSplitterId = null;
            resolvedPortNumber = null;
          } else if (input.splitterCode !== undefined) {
            if (input.splitterCode === null) {
              resolvedSplitterId = null;
              resolvedPortNumber = null;
            } else {
              const targetSplitter = await tx.networkSplitter.findFirst({
                where: {
                  OR: [
                    { splitterCode: { equals: input.splitterCode, mode: 'insensitive' } },
                    { id: input.splitterCode },
                  ],
                },
                include: { cluster: true },
              });
              if (!targetSplitter) {
                throw new Error(`ODP Splitter "${input.splitterCode}" tidak ditemukan.`);
              }
              const existingClusterId = existing.clusterId ?? existing.cluster?.id ?? null;
              const targetClusterId = targetSplitter.clusterId ?? targetSplitter.cluster?.id ?? null;
              const existingClusterCode = existing.cluster?.clusterCode ?? null;
              const targetClusterCode = targetSplitter.cluster?.clusterCode ?? null;
              if (
                (existingClusterId && targetClusterId && existingClusterId !== targetClusterId) ||
                (existingClusterCode &&
                  targetClusterCode &&
                  existingClusterCode.toLowerCase() !== targetClusterCode.toLowerCase()) ||
                !matchesAssignedClusters(actor, targetClusterCode, targetSplitter.cluster?.name)
              ) {
                throw new AuthHttpError(
                  403,
                  ERROR_CODES.FORBIDDEN,
                  'Akses ditolak: ODP Splitter tujuan berada di cluster yang berbeda dengan pelanggan.',
                );
              }
              if (resolvedPortNumber !== null && resolvedPortNumber > targetSplitter.maxPorts) {
                throw new Error(
                  `Nomor port ${resolvedPortNumber} melebihi batas kapasitas ODP (${targetSplitter.maxPorts} port).`,
                );
              }
              if (resolvedPortNumber !== null && nextStatus === 'ACTIVE') {
                const occupied = await tx.customer.findFirst({
                  where: {
                    splitterId: targetSplitter.id,
                    portNumber: resolvedPortNumber,
                    status: 'ACTIVE',
                    id: { not: existing.id },
                  },
                });
                if (occupied) {
                  throw new Error(
                    `${ERROR_CODES.PORT_OCCUPIED}: Port ${resolvedPortNumber} pada ${targetSplitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`,
                  );
                }
              }
              resolvedSplitterId = targetSplitter.id;
            }
          } else if (
            input.portNumber !== undefined &&
            input.portNumber !== null &&
            resolvedSplitterId &&
            nextStatus === 'ACTIVE'
          ) {
            const sp = await tx.networkSplitter.findUnique({ where: { id: resolvedSplitterId } });
            if (sp && input.portNumber > sp.maxPorts) {
              throw new Error(
                `Nomor port ${input.portNumber} melebihi batas kapasitas ODP (${sp.maxPorts} port).`,
              );
            }
            const occupied = await tx.customer.findFirst({
              where: {
                splitterId: resolvedSplitterId,
                portNumber: input.portNumber,
                status: 'ACTIVE',
                id: { not: existing.id },
              },
            });
            if (occupied) {
              throw new Error(
                `${ERROR_CODES.PORT_OCCUPIED}: Port ${input.portNumber} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`,
              );
            }
          }

          const nextOlt =
            input.oltAttenuation !== undefined
              ? input.oltAttenuation
              : existing.oltAttenuation != null
                ? Number(existing.oltAttenuation)
                : null;
          const nextOnt =
            input.ontAttenuation !== undefined
              ? input.ontAttenuation
              : existing.ontAttenuation != null
                ? Number(existing.ontAttenuation)
                : null;
          const shouldSyncCurrentAtt =
            input.ontAttenuation !== undefined || input.oltAttenuation !== undefined;
          const nextCurrentAtt = shouldSyncCurrentAtt
            ? (nextOnt ?? nextOlt)
            : existing.currentAttenuation != null
              ? Number(existing.currentAttenuation)
              : null;

          const next = await tx.customer.update({
            where: { id: existing.id },
            data: {
              fullName: input.fullName ?? existing.fullName,
              address: input.address ?? existing.address,
              lat: input.lat !== undefined ? input.lat : existing.lat,
              lng: input.lng !== undefined ? input.lng : existing.lng,
              status: nextStatus,
              splitterId: resolvedSplitterId,
              portNumber: resolvedPortNumber,
              oltAttenuation: nextOlt,
              ontAttenuation: nextOnt,
              currentAttenuation: nextCurrentAtt,
              picName: input.picName !== undefined ? input.picName : existing.picName,
              picPhone: input.picPhone !== undefined ? input.picPhone : existing.picPhone,
              picRole: input.picRole !== undefined ? input.picRole : existing.picRole,
              profileDescription:
                input.profileDescription !== undefined
                  ? input.profileDescription
                  : existing.profileDescription,
              photoObjectKey:
                input.photoObjectKey !== undefined
                  ? input.photoObjectKey
                  : existing.photoObjectKey,
              photoCaption:
                input.photoCaption !== undefined ? input.photoCaption : existing.photoCaption,
              lastActivityNote:
                input.lastActivityNote !== undefined
                  ? input.lastActivityNote
                  : existing.lastActivityNote,
              gponNode: input.gponNode !== undefined ? input.gponNode : existing.gponNode,
              oltSlot: input.oltSlot !== undefined ? input.oltSlot : existing.oltSlot,
              ontSn: input.ontSn !== undefined ? input.ontSn : existing.ontSn,
              notes: input.notes !== undefined ? input.notes : existing.notes,
            },
            include: { cluster: true, splitter: true },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              actionType: 'CUSTOMER_PROFILE_UPDATED',
              targetEntity: 'customer',
              targetId: existing.id,
              oldPayload: {
                fullName: existing.fullName,
                address: existing.address,
                status: existing.status,
                picName: existing.picName,
                picPhone: existing.picPhone,
                profileDescription: existing.profileDescription,
                oltAttenuation: existing.oltAttenuation ? Number(existing.oltAttenuation) : null,
                ontAttenuation: existing.ontAttenuation ? Number(existing.ontAttenuation) : null,
                lastActivityNote: existing.lastActivityNote,
                splitterCode: existing.splitter?.splitterCode ?? null,
                portNumber: existing.portNumber,
              } as Prisma.InputJsonValue,
              newPayload: {
                fullName: next.fullName,
                address: next.address,
                status: next.status,
                picName: next.picName,
                picPhone: next.picPhone,
                profileDescription: next.profileDescription,
                oltAttenuation: next.oltAttenuation ? Number(next.oltAttenuation) : null,
                ontAttenuation: next.ontAttenuation ? Number(next.ontAttenuation) : null,
                lastActivityNote: next.lastActivityNote,
                splitterCode: next.splitter?.splitterCode ?? null,
                portNumber: next.portNumber,
              } as Prisma.InputJsonValue,
            },
          });

          return next;
        });

        const parsed = parseCustomerAddress(updated.address);
        const photoUrl = await resolvePhotoUrl(updated.photoObjectKey);
        return {
          id: updated.id,
          siaNumber: updated.siaNumber,
          fullName: updated.fullName,
          address: updated.address,
          lat: updated.lat ? Number(updated.lat) : undefined,
          lng: updated.lng ? Number(updated.lng) : undefined,
          kecamatan: parsed.kecamatan,
          kelurahan: parsed.kelurahan,
          street: parsed.street,
          cluster: updated.cluster?.name || 'Palembang',
          clusterCode: updated.cluster?.clusterCode || 'PLBHRAGA01',
          splitterCode: updated.splitter?.splitterCode ?? null,
          splitterName: updated.splitter?.name ?? null,
          odpLat: updated.splitter?.lat ? Number(updated.splitter.lat) : null,
          odpLng: updated.splitter?.lng ? Number(updated.splitter.lng) : null,
          portNumber: updated.portNumber ?? null,
          currentAttenuation:
            updated.currentAttenuation != null ? Number(updated.currentAttenuation) : null,
          oltAttenuation: updated.oltAttenuation != null ? Number(updated.oltAttenuation) : null,
          ontAttenuation: updated.ontAttenuation != null ? Number(updated.ontAttenuation) : null,
          status: updated.status,
          picName: updated.picName ?? null,
          picPhone: updated.picPhone ?? null,
          picRole: updated.picRole ?? null,
          profileDescription: updated.profileDescription ?? null,
          photoObjectKey: updated.photoObjectKey ?? null,
          photoUrl,
          photoCaption: updated.photoCaption ?? null,
          lastActivityNote: updated.lastActivityNote ?? null,
          gponNode: updated.gponNode ?? null,
          oltSlot: updated.oltSlot ?? null,
          ontSn: updated.ontSn ?? null,
          notes: updated.notes ?? null,
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        if (err instanceof AuthHttpError) {
          throw err;
        }
        if (
          err instanceof Error &&
          (err.message.includes('tidak ditemukan') ||
            err.message.includes(ERROR_CODES.PORT_OCCUPIED) ||
            err.message.includes('melebihi'))
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui data pelanggan di PostgreSQL.');
        if (isStrictLiveMode()) {
          throw err;
        }
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
    if (input.lat !== undefined) fallback.lat = input.lat ?? undefined;
    if (input.lng !== undefined) fallback.lng = input.lng ?? undefined;
    if (input.picName !== undefined) fallback.picName = input.picName;
    if (input.picPhone !== undefined) fallback.picPhone = input.picPhone;
    if (input.picRole !== undefined) fallback.picRole = input.picRole;
    if (input.profileDescription !== undefined) fallback.profileDescription = input.profileDescription;
    if (input.photoObjectKey !== undefined) {
      fallback.photoObjectKey = input.photoObjectKey;
      fallback.photoUrl = input.photoObjectKey;
    }
    if (input.photoCaption !== undefined) fallback.photoCaption = input.photoCaption;
    if (input.oltAttenuation !== undefined) fallback.oltAttenuation = input.oltAttenuation;
    if (input.ontAttenuation !== undefined) {
      fallback.ontAttenuation = input.ontAttenuation;
      fallback.currentAttenuation = input.ontAttenuation;
    }
    if (input.lastActivityNote !== undefined) fallback.lastActivityNote = input.lastActivityNote;
    if (input.gponNode !== undefined) fallback.gponNode = input.gponNode;
    if (input.oltSlot !== undefined) fallback.oltSlot = input.oltSlot;
    if (input.ontSn !== undefined) fallback.ontSn = input.ontSn;
    if (input.notes !== undefined) fallback.notes = input.notes;
    if (input.status) {
      fallback.status = input.status;
      if (input.status === 'DISMANTLED') fallback.portNumber = null;
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
      splitterCode: null,
      portNumber: null,
      currentAttenuation: null,
      status: 'PENDING_INSTALL',
      gponNode: null,
      oltSlot: null,
      ontSn: null,
      notes: null,
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
