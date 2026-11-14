import { prisma, Prisma } from '@repo/database';
import { redisManager } from '../lib/redis';
import {
  isStrictLiveMode,
  requireLiveDatabase,
  rethrowIfStrictDatabaseError,
} from '../lib/live-data';
import {
  CreateTicketInput,
  DispatchTicketInput,
  StartTicketExecutionInput,
  SubmitTicketInput,
  TicketQuery,
  ActivityFeedItem,
  classifyDbm,
  MAX_GEOFENCE_RADIUS_METERS,
  ERROR_CODES,
  UserSessionContext,
  DbTicket,
  DbTicketPendingSubmission,
} from '@repo/shared';
import { sseBroadcaster } from './sse.service';
import { AuthService } from './auth.service';
import {
  sendVendorTaskDispatchTelegram,
  sendVendorVerificationResultTelegram,
} from '../lib/telegram';

import { CustomerService } from './customer.service';

export type { DbTicket, DbTicketPendingSubmission };
const FALLBACK_TICKETS: DbTicket[] = [
  {
    id: 't-1',
    ticketNumber: 'TK-2024-001',
    customerName: 'Budi Santoso',
    siaNumber: 'SLA-100244-001',
    ticketType: 'Pasang baru',
    cluster: 'Bandung Utara',
    clusterCode: 'BDG-01',
    assignedTech: 'Andi Pratama',
    assignedTechUsername: 'andi.pratama',
    vendorName: 'PT Mitra Fiber Nusantara',
    techInitials: 'AP',
    status: 'Menunggu',
    priority: 'Normal',
    currentAttenuation: -18.5,
    complaintSummary: 'Permintaan instalasi baru internet dedicated 100 Mbps kantor cabang.',
    customerPhone: '+62 812-2200-1001',
    serviceAddress: 'Jl. Riau No. 45, Citarum, Kec. Bandung Wetan, Bandung',
    locationPlace: 'Gedung Graha Riau Lt. 3 (Sebelah Bank Mandiri)',
    targetLat: -6.9062,
    targetLng: 107.6186,
    dispatchedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date().toISOString(),
    splitterCode: 'ODP-BDG-01',
    portNumber: 1,
    distanceToSplitterM: 18,
    isLocationFlagged: false,
  },
  {
    id: 't-2',
    ticketNumber: 'TK-2024-002',
    customerName: 'PT. Maju Jaya',
    siaNumber: 'SLA-100243-002',
    ticketType: 'Perbaikan',
    cluster: 'Cimahi',
    clusterCode: 'CMH-01',
    assignedTech: 'Rizky Maulana',
    assignedTechUsername: 'rizky.maulana',
    vendorName: 'PT Sarana Optik Bandung',
    techInitials: 'RM',
    status: 'Menunggu verifikasi',
    priority: 'High',
    currentAttenuation: -24.8,
    complaintSummary: 'Koneksi LOS merah sejak pukul 08:15 WIB akibat kabel drop tertabrak truk.',
    customerPhone: '+62 813-9900-4455',
    serviceAddress: 'Jl. Baros No. 12, Baros, Kec. Cimahi Tengah, Cimahi',
    locationPlace: 'Ruko Baros Sentral Blok C-4',
    targetLat: -6.8722,
    targetLng: 107.5422,
    dispatchedAt: new Date(Date.now() - 10800000).toISOString(),
    startedAt: new Date(Date.now() - 5400000).toISOString(),
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    splitterCode: 'ODP-CMH-01',
    portNumber: 3,
    distanceToSplitterM: 24,
    isLocationFlagged: false,
    pendingSubmission: {
      submissionId: 'c1b48d2a-431f-4e98-8b9a-1928495a8120',
      splitterId: 'ODP-CMH-01',
      splitterCode: 'ODP-CMH-01',
      portNumber: 3,
      attenuationDbm: -19.4,
      photoObjectKey: 'opm-proofs/2025/02/t-2-opm.webp',
      submittedLat: -6.8722,
      submittedLng: 107.5422,
      distanceToSplitterM: 24,
      isLocationFlagged: false,
      channel: 'MOBILE',
      technicianNotes:
        'Perbaikan fast connector di ODP-CMH-01 port 3 selesai. Redaman turun dari -24.8 dBm menjadi -19.4 dBm (Normal).',
      submittedAt: new Date(Date.now() - 900000).toISOString(),
      techUsername: 'rizky.maulana',
      techFullName: 'Rizky Maulana',
    },
  },
  {
    id: 't-3',
    ticketNumber: 'TK-2024-003',
    customerName: 'IndoTech Solusi',
    siaNumber: 'SLA-100242-003',
    ticketType: 'Maintenance',
    cluster: 'Bandung Barat',
    clusterCode: 'BDG-04',
    assignedTech: 'Fajar Hidayat',
    assignedTechUsername: 'fajar.hidayat',
    vendorName: 'PT Mitra Fiber Nusantara',
    techInitials: 'FH',
    status: 'Menunggu verifikasi',
    priority: 'Normal',
    currentAttenuation: -21.2,
    complaintSummary: 'Latency tinggi & packet loss 15% saat jam sibuk, perlu cek redaman pigtail.',
    customerPhone: '+62 819-3344-9900',
    serviceAddress: 'Jl. Pasteur No. 34, Pasteur, Kec. Sukajadi, Bandung',
    locationPlace: 'Kompleks Perkantoran Pasteur Regency No. 34',
    targetLat: -6.8935,
    targetLng: 107.5902,
    dispatchedAt: new Date(Date.now() - 7200000).toISOString(),
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    splitterCode: 'ODP-BDG-03',
    portNumber: 2,
    distanceToSplitterM: 15,
    isLocationFlagged: false,
    pendingSubmission: {
      submissionId: 'e2a84a6e-826d-4b53-9ecb-36573887b21e',
      splitterId: 'ODP-BDG-03',
      splitterCode: 'ODP-BDG-03',
      portNumber: 2,
      attenuationDbm: -19.8,
      photoObjectKey: 'opm-proofs/2025/02/t-3-opm.webp',
      submittedLat: -6.914744,
      submittedLng: 107.60981,
      distanceToSplitterM: 15,
      isLocationFlagged: false,
      channel: 'WEB',
      technicianNotes:
        'Selesai splicing drop core dan penggantian pigtail di ODP port 2. Hasil ukur OPM stabil di -19.8 dBm.',
      submittedAt: new Date(Date.now() - 1800000).toISOString(),
      techUsername: 'fajar.hidayat',
      techFullName: 'Fajar Hidayat',
    },
  },
  {
    id: 't-4',
    ticketNumber: 'TK-2024-004',
    customerName: 'Toko Sejahtera',
    siaNumber: 'SLA-100241-004',
    ticketType: 'Perbaikan',
    cluster: 'Rancaekek',
    clusterCode: 'RCK-01',
    assignedTech: 'Dedi Kurniawan',
    assignedTechUsername: 'dedi.kurniawan',
    vendorName: 'CV Jaringan Nusantara',
    techInitials: 'DK',
    status: 'Selesai',
    priority: 'Low',
    currentAttenuation: -19.4,
    complaintSummary: 'Perbaikan konektor patchcord ONT longgar.',
    serviceAddress: 'Jl. Raya Rancaekek No. 89, Bandung',
    locationPlace: 'Toko Sejahtera Dekat Pertigaan Dangdeur',
    targetLat: -6.9685,
    targetLng: 107.7685,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    splitterCode: 'ODP-RCK-01',
    portNumber: 4,
    distanceToSplitterM: 32,
    isLocationFlagged: false,
  },
  {
    id: 't-5',
    ticketNumber: 'TK-2024-005',
    customerName: 'Hotel Grand Prima',
    siaNumber: 'SLA-100240-005',
    ticketType: 'Instalasi',
    cluster: 'Cimahi',
    clusterCode: 'CMH-01',
    assignedTech: 'Agus Setiawan',
    assignedTechUsername: 'agus.setiawan',
    vendorName: 'PT Sarana Optik Bandung',
    techInitials: 'AS',
    status: 'Menunggu',
    priority: 'High',
    currentAttenuation: -26.1,
    complaintSummary: 'Pasang baru jalur backup fiber gedung hotel utama.',
    customerPhone: '+62 878-9988-1122',
    serviceAddress: 'Jl. Jend. Amir Machmud No. 512, Cimahi',
    locationPlace: 'Lobby Belakang Ruang Server Hotel Grand Prima',
    targetLat: -6.8752,
    targetLng: 107.5458,
    dispatchedAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date().toISOString(),
    splitterCode: 'ODP-CMH-02',
    portNumber: 7,
    distanceToSplitterM: 142,
    isLocationFlagged: true,
  },
  {
    id: 'wo-2025-0842',
    ticketNumber: 'WO-2025-0842',
    customerName: 'PT Sriwijaya Mandiri',
    siaNumber: 'SLA-100245-0842',
    ticketType: 'Perbaikan',
    cluster: 'Palembang Kota',
    clusterCode: 'PLB-01',
    assignedTech: 'Andi Pratama',
    assignedTechUsername: 'tech.andi',
    vendorName: 'PT Mitra Fiber Nusantara',
    techInitials: 'AP',
    status: 'Dalam proses',
    priority: 'High',
    currentAttenuation: -19.5,
    complaintSummary: 'Perbaikan redaman fiber optik ODP-PLB-034.',
    customerPhone: '+62 811-7890-1234',
    serviceAddress: 'Jl. Jend. Sudirman No. 45, Palembang',
    locationPlace: 'Gedung Sriwijaya Lt. 2',
    targetLat: -2.976383,
    targetLng: 104.741487,
    dispatchedAt: new Date(Date.now() - 3600000).toISOString(),
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date().toISOString(),
    splitterCode: 'ODP-PLB-034',
    portNumber: 2,
    distanceToSplitterM: 0,
    isLocationFlagged: false,
  },
  {
    id: 'wo-2025-0841',
    ticketNumber: 'WO-2025-0841',
    customerName: 'CV Musi Digital',
    siaNumber: 'SLA-100244-0841',
    ticketType: 'Perbaikan',
    cluster: 'Palembang Kota',
    clusterCode: 'PLB-01',
    assignedTech: 'Rizky Maulana',
    assignedTechUsername: 'tech.rizky',
    vendorName: 'PT Sarana Optik Palembang',
    techInitials: 'RM',
    status: 'Selesai',
    priority: 'Normal',
    currentAttenuation: -18.2,
    complaintSummary: 'Penyambungan core fiber selesai.',
    customerPhone: '+62 812-7100-2233',
    serviceAddress: 'Jl. R. Sukamto No. 88, Palembang',
    locationPlace: 'Ruko PTC Mall Blok B-12',
    targetLat: -2.9612,
    targetLng: 104.7645,
    dispatchedAt: new Date(Date.now() - 7200000).toISOString(),
    startedAt: new Date(Date.now() - 5400000).toISOString(),
    completedAt: new Date(Date.now() - 1800000).toISOString(),
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    splitterCode: 'ODP-PLB-034',
    portNumber: 3,
    distanceToSplitterM: 12,
    isLocationFlagged: false,
  },
];

export interface InMemorySubmissionRecord {
  submissionId: string;
  ticketId: string;
  ticketNumber?: string;
  techId?: string;
  techUsername?: string;
}

const inMemoryProcessedSubmissions = new Map<string, InMemorySubmissionRecord>();

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula (returns meters).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Extracts initials from a user's full name (e.g. "Andi Pratama" -> "AP").
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function parsePendingPayload(raw: unknown): DbTicketPendingSubmission | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.submissionId !== 'string' || typeof obj.attenuationDbm !== 'number') {
    return undefined;
  }
  return {
    submissionId: obj.submissionId,
    splitterId: String(obj.splitterId || obj.splitterCode || ''),
    splitterCode: String(obj.splitterCode || obj.splitterId || ''),
    portNumber: Number(obj.portNumber || 1),
    attenuationDbm: Number(obj.attenuationDbm),
    photoObjectKey: String(obj.photoObjectKey || ''),
    submittedLat: Number(obj.submittedLat || 0),
    submittedLng: Number(obj.submittedLng || 0),
    distanceToSplitterM: Number(obj.distanceToSplitterM || 0),
    isLocationFlagged: Boolean(obj.isLocationFlagged),
    clientRecordedAt:
      typeof obj.clientRecordedAt === 'string' ? obj.clientRecordedAt : undefined,
    technicianNotes: typeof obj.technicianNotes === 'string' ? obj.technicianNotes : undefined,
    channel:
      obj.channel === 'WEB' || obj.channel === 'MOBILE' || obj.channel === 'TELEGRAM'
        ? obj.channel
        : undefined,
    submittedAt:
      typeof obj.submittedAt === 'string' ? obj.submittedAt : new Date().toISOString(),
    techUsername: String(obj.techUsername || ''),
    techFullName: String(obj.techFullName || ''),
  };
}

const DB_STATUS_TO_UI: Record<string, DbTicket['status']> = {
  OPEN: 'Menunggu',
  IN_PROGRESS: 'Dalam proses',
  PENDING_APPROVAL: 'Menunggu verifikasi',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

function mapDbTicketToDto(t: {
  id: string;
  ticketNumber: string;
  ticketType: string;
  status: string;
  vendorName?: string | null;
  complaintSummary?: string | null;
  customerPhone?: string | null;
  serviceAddress?: string | null;
  locationPlace?: string | null;
  targetLat?: unknown;
  targetLng?: unknown;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  pendingPayload?: unknown;
  dispatchedAt?: Date | null;
  startedAt?: Date | null;
  assignedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  customer: {
    fullName: string;
    siaNumber: string;
    address: string;
    lat?: unknown;
    lng?: unknown;
    portNumber?: number | null;
    currentAttenuation?: unknown;
    cluster: { name: string; clusterCode?: string | null };
    splitter?: { splitterCode: string } | null;
  };
  assignedTech?: {
    username: string;
    fullName: string;
    vendorCompany?: string | null;
  } | null;
}): DbTicket {
  const pendingSubmission = parsePendingPayload(t.pendingPayload);
  const resolvedLat =
    t.targetLat !== null && t.targetLat !== undefined
      ? Number(t.targetLat)
      : t.customer.lat !== null && t.customer.lat !== undefined
        ? Number(t.customer.lat)
        : undefined;
  const resolvedLng =
    t.targetLng !== null && t.targetLng !== undefined
      ? Number(t.targetLng)
      : t.customer.lng !== null && t.customer.lng !== undefined
        ? Number(t.customer.lng)
        : undefined;

  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    customerName: t.customer.fullName,
    siaNumber: t.customer.siaNumber,
    ticketType: t.ticketType === 'PSB' ? 'Pasang baru' : 'Maintenance',
    cluster: t.customer.cluster.name,
    clusterCode: t.customer.cluster.clusterCode || undefined,
    assignedTech: t.assignedTech?.fullName || 'Belum Ditugaskan',
    assignedTechUsername: t.assignedTech?.username || undefined,
    vendorName: t.vendorName || t.assignedTech?.vendorCompany || undefined,
    techInitials: t.assignedTech ? getInitials(t.assignedTech.fullName) : 'TK',
    status: pendingSubmission && t.status === 'IN_PROGRESS'
      ? 'Menunggu verifikasi'
      : DB_STATUS_TO_UI[t.status] || 'Menunggu',
    currentAttenuation: t.customer.currentAttenuation
      ? Number(t.customer.currentAttenuation)
      : -20.0,
    complaintSummary: t.complaintSummary || undefined,
    customerPhone: t.customerPhone || undefined,
    serviceAddress:
      t.serviceAddress && t.serviceAddress !== '-' ? t.serviceAddress : t.customer.address,
    locationPlace: t.locationPlace || undefined,
    targetLat: resolvedLat,
    targetLng: resolvedLng,
    adminNotes: t.adminNotes || undefined,
    rejectionReason: t.rejectionReason || undefined,
    dispatchedAt: (t.dispatchedAt || t.assignedAt)?.toISOString(),
    startedAt: t.startedAt?.toISOString(),
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
    splitterCode: pendingSubmission?.splitterCode || t.customer.splitter?.splitterCode,
    portNumber: pendingSubmission?.portNumber || t.customer.portNumber || undefined,
    distanceToSplitterM: pendingSubmission?.distanceToSplitterM,
    isLocationFlagged: pendingSubmission?.isLocationFlagged,
    pendingSubmission,
  };
}

function matchesTechIdentity(
  assignedTechName: string | undefined,
  assignedTechUsername: string | undefined,
  actorUsername: string,
): boolean {
  const actorLower = actorUsername.trim().toLowerCase().replace(/^tech\./, '');
  const usernameLower = (assignedTechUsername || '').trim().toLowerCase().replace(/^tech\./, '');
  const fullLower = (assignedTechName || '').trim().toLowerCase().replace(/\s+/g, '.');
  if (usernameLower && (actorLower === usernameLower || actorUsername.toLowerCase() === assignedTechUsername?.toLowerCase())) {
    return true;
  }
  if (!fullLower) return false;
  return actorLower === fullLower || fullLower.startsWith(`${actorLower}.`) || actorLower === fullLower.split('.')[0];
}

export class TicketService {
  /**
   * Retrieves ticket list with cluster scoping (RLS) and search filters.
   */
  public static async listTickets(
    params: Partial<TicketQuery> = {},
    userContext?: UserSessionContext,
  ): Promise<DbTicket[]> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat tiket.')) {
      try {
        // Build Prisma where clause with cluster scoping (Law 4)
        const whereClause: Record<string, unknown> = {};

        if (
          userContext &&
          userContext.userType !== 'SUPER_ADMIN' &&
          userContext.assignedClusters.length > 0
        ) {
          whereClause.customer = {
            cluster: {
              clusterCode: { in: userContext.assignedClusters },
            },
          };
        }

        if (params.cluster && params.cluster !== 'Semua cluster') {
          const clusterFilter = params.cluster.replace('Bandung ', '');
          whereClause.customer = {
            ...(whereClause.customer as object),
            cluster: {
              OR: [
                { name: { contains: clusterFilter, mode: 'insensitive' } },
                { clusterCode: { contains: clusterFilter, mode: 'insensitive' } },
              ],
            },
          };
        }

        if (params.status && params.status !== 'Semua') {
          const statusMap: Record<string, string> = {
            Menunggu: 'OPEN',
            'Dalam proses': 'IN_PROGRESS',
            'Menunggu verifikasi': 'PENDING_APPROVAL',
            PENDING_APPROVAL: 'PENDING_APPROVAL',
            Selesai: 'COMPLETED',
            Dibatalkan: 'CANCELLED',
            OPEN: 'OPEN',
            IN_PROGRESS: 'IN_PROGRESS',
            COMPLETED: 'COMPLETED',
            CANCELLED: 'CANCELLED',
          };
          const mappedStatus = statusMap[params.status];
          if (mappedStatus) {
            whereClause.status = mappedStatus;
          }
        }

        const tickets = await prisma.ticket.findMany({
          where: whereClause,
          include: {
            customer: {
              include: {
                cluster: true,
                splitter: true,
              },
            },
            assignedTech: true,
          },
          orderBy: { createdAt: 'desc' },
          take: params.limit || 50,
          skip: params.offset || 0,
        });

        if (isStrictLiveMode() || tickets.length > 0) {
          let mapped = tickets.map(mapDbTicketToDto);
          if (params.query) {
            const q = params.query.toLowerCase();
            mapped = mapped.filter(
              (t) =>
                t.ticketNumber.toLowerCase().includes(q) ||
                t.customerName.toLowerCase().includes(q) ||
                t.siaNumber.toLowerCase().includes(q) ||
                t.cluster.toLowerCase().includes(q) ||
                t.assignedTech.toLowerCase().includes(q) ||
                (t.vendorName || '').toLowerCase().includes(q) ||
                (t.serviceAddress || '').toLowerCase().includes(q) ||
                (t.locationPlace || '').toLowerCase().includes(q),
            );
          }
          return mapped;
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal membaca daftar tiket dari PostgreSQL.');
      }
    }

    // Fallback: In-memory store
    let result = [...FALLBACK_TICKETS];

    if (
      userContext &&
      userContext.userType !== 'SUPER_ADMIN' &&
      userContext.assignedClusters.length > 0
    ) {
      result = result.filter((t) =>
        userContext.assignedClusters.some((c) => t.cluster.toLowerCase().includes(c.toLowerCase())),
      );
    }

    if (params.cluster && params.cluster !== 'Semua cluster') {
      result = result.filter((t) =>
        t.cluster.toLowerCase().includes(params.cluster!.toLowerCase()),
      );
    }

    if (params.status && params.status !== 'Semua') {
      result = result.filter((t) => t.status === params.status);
    }

    if (params.query) {
      const q = params.query.toLowerCase();
      result = result.filter(
        (t) =>
          t.ticketNumber.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.siaNumber.toLowerCase().includes(q) ||
          t.cluster.toLowerCase().includes(q) ||
          t.assignedTech.toLowerCase().includes(q) ||
          (t.vendorName || '').toLowerCase().includes(q) ||
          (t.serviceAddress || '').toLowerCase().includes(q) ||
          (t.locationPlace || '').toLowerCase().includes(q) ||
          (t.complaintSummary || '').toLowerCase().includes(q),
      );
    }

    return result;
  }

  /**
   * Retrieves single ticket by internal ID or ticketNumber.
   */
  public static async getTicketById(id: string): Promise<DbTicket> {
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memuat detail tiket.')) {
      try {
        const ticket = await prisma.ticket.findFirst({
          where: {
            OR: [{ id }, { ticketNumber: id }],
          },
          include: {
            customer: {
              include: {
                cluster: true,
                splitter: true,
              },
            },
            assignedTech: true,
          },
        });

        if (ticket) {
          return mapDbTicketToDto(ticket);
        }
        if (isStrictLiveMode()) {
          const notFound = new Error(`Tiket dengan ID ${id} tidak ditemukan`) as Error & {
            statusCode?: number;
          };
          notFound.statusCode = 404;
          throw notFound;
        }
      } catch (err) {
        if ((err as Error).message.includes('tidak ditemukan')) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal membaca detail tiket dari PostgreSQL.');
      }
    }

    const cached = FALLBACK_TICKETS.find((t) => t.id === id || t.ticketNumber === id);
    if (!cached) {
      throw new Error(`Tiket dengan ID ${id} tidak ditemukan`);
    }
    return cached;
  }

  private static async resolveTechProfile(identifier: string): Promise<{
    id?: string;
    username: string;
    fullName: string;
    vendorCompany?: string;
    telegramChatId?: string | null;
  }> {
    const acc = await AuthService.resolveAccountByUsername(identifier);
    if (acc) {
      return {
        id: acc.id,
        username: acc.username,
        fullName: acc.fullName,
        vendorCompany: acc.vendorCompany || undefined,
        telegramChatId: acc.telegramChatId,
      };
    }
    return {
      username: identifier,
      fullName: identifier,
    };
  }

  /**
   * Creates a new ticket dispatched by CS / Admin Lintasarta (PSB or Maintenance).
   * Automatically creates PENDING_INSTALL customer records in PostgreSQL for new PSB requests.
   */
  public static async createTicket(input: CreateTicketInput, adminId = 'superadmin') {
    const techProfile = await this.resolveTechProfile(input.assignedTechUsername);
    const resolvedVendorName = input.vendorName?.trim() || techProfile.vendorCompany;
    const resolvedClusterName = input.clusterCode.startsWith('Bandung') ||
      input.clusterCode.startsWith('Cimahi') ||
      input.clusterCode.startsWith('Rancaekek')
      ? input.clusterCode
      : `Bandung ${input.clusterCode}`;

    // Lookup existing customer metadata when CS/AI omits address or coordinates
    const fallbackCustomers = await CustomerService.listCustomers(input.siaNumber);
    const matchedCust = fallbackCustomers.find(
      (c) => c.siaNumber.toLowerCase() === input.siaNumber.toLowerCase(),
    );
    const resolvedAddress =
      input.serviceAddress?.trim() || matchedCust?.address || `Area Cluster ${resolvedClusterName}`;
    const resolvedLat = input.targetLat ?? matchedCust?.lat;
    const resolvedLng = input.targetLng ?? matchedCust?.lng;
    const dispatchedIso = new Date().toISOString();

    const nextNumber = `WO-2025-0${843 + FALLBACK_TICKETS.length}`;
    const newTicket: DbTicket = {
      id: `t-${Date.now()}`,
      ticketNumber: nextNumber,
      customerName: input.customerName,
      siaNumber: input.siaNumber,
      ticketType: input.ticketType === 'PSB' ? 'Pasang baru' : 'Maintenance',
      cluster: resolvedClusterName,
      clusterCode: input.clusterCode,
      assignedTech: techProfile.fullName,
      assignedTechUsername: techProfile.username,
      vendorName: resolvedVendorName,
      techInitials: getInitials(techProfile.fullName),
      status: 'Menunggu',
      currentAttenuation: matchedCust?.currentAttenuation ?? -20.0,
      complaintSummary: input.complaintSummary?.trim() || undefined,
      customerPhone: input.customerPhone?.trim() || undefined,
      serviceAddress: resolvedAddress,
      locationPlace: input.locationPlace?.trim() || undefined,
      targetLat: resolvedLat,
      targetLng: resolvedLng,
      dispatchedAt: dispatchedIso,
      adminNotes: input.adminNotes || 'Ditugaskan oleh tim CS / Pusat Lintasarta',
      createdAt: dispatchedIso,
    };

    if (!matchedCust && !isStrictLiveMode()) {
      CustomerService.ensureFallbackCustomer({
        siaNumber: input.siaNumber,
        fullName: input.customerName,
        address: resolvedAddress,
        lat: resolvedLat,
        lng: resolvedLng,
        clusterName: resolvedClusterName,
        clusterCode: input.clusterCode,
      });
    }

    if (!isStrictLiveMode()) {
      FALLBACK_TICKETS.unshift(newTicket);
    }

    let techTelegramChatId = techProfile.telegramChatId || null;

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk membuat tiket baru.')) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          let dbCustomer = await tx.customer.findFirst({
            where: { siaNumber: input.siaNumber },
          });

          if (!dbCustomer) {
            const cluster =
              (await tx.networkCluster.findFirst({
                where: {
                  OR: [
                    { clusterCode: { equals: input.clusterCode, mode: 'insensitive' } },
                    { name: { contains: input.clusterCode.replace(/^Bandung\s+/i, ''), mode: 'insensitive' } },
                  ],
                },
              })) ||
              (await tx.networkCluster.findFirst({ where: { isActive: true } }));

            if (!cluster) {
              throw new Error(`${ERROR_CODES.CLUSTER_NOT_FOUND}: Cluster jaringan belum tersedia di DB.`);
            }

            dbCustomer = await tx.customer.create({
              data: {
                siaNumber: input.siaNumber,
                fullName: input.customerName,
                address: resolvedAddress,
                lat: resolvedLat ?? null,
                lng: resolvedLng ?? null,
                clusterId: cluster.id,
                status: 'PENDING_INSTALL',
              },
            });
          }

          const dbAdmin =
            (await tx.user.findFirst({
              where: { OR: [{ id: adminId }, { username: adminId }] },
            })) ||
            (await tx.user.findFirst({
              where: { userType: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
            }));

          const dbTech = await tx.user.findFirst({
            where: {
              OR: [
                { username: techProfile.username },
                { username: input.assignedTechUsername },
                { fullName: { equals: techProfile.fullName, mode: 'insensitive' } },
              ],
            },
          });

          if (!dbAdmin) {
            return null;
          }

          if (dbTech?.telegramChatId) {
            techTelegramChatId = dbTech.telegramChatId;
          }

          const dbTicket = await tx.ticket.create({
            data: {
              ticketNumber: newTicket.ticketNumber,
              ticketType: input.ticketType,
              customerId: dbCustomer.id,
              assignedTechId: dbTech?.id ?? null,
              createdByAdminId: dbAdmin.id,
              status: 'OPEN',
              vendorName: resolvedVendorName || dbTech?.vendorCompany || null,
              complaintSummary: input.complaintSummary?.trim() || null,
              customerPhone: input.customerPhone?.trim() || null,
              serviceAddress: resolvedAddress,
              locationPlace: input.locationPlace?.trim() || null,
              targetLat: resolvedLat ?? null,
              targetLng: resolvedLng ?? null,
              dispatchedAt: new Date(),
              assignedAt: new Date(),
              adminNotes: input.adminNotes || null,
            },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: dbAdmin.id,
              actorRole: 'CS / Admin Lintasarta',
              actionType: 'TICKET_CREATED_AND_DISPATCHED',
              targetEntity: 'ticket',
              targetId: dbTicket.id,
              newPayload: {
                ticketNumber: dbTicket.ticketNumber,
                vendorName: dbTicket.vendorName,
                assignedTech: techProfile.fullName,
                serviceAddress: resolvedAddress,
                locationPlace: input.locationPlace || null,
                targetLat: resolvedLat ?? null,
                targetLng: resolvedLng ?? null,
              } as Prisma.InputJsonValue,
            },
          });

          return dbTicket;
        });

        if (created) {
          newTicket.id = created.id;
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal menyimpan tiket baru ke PostgreSQL.');
        throw err;
      }
    }

    const liveItem: ActivityFeedItem = {
      id: newTicket.id,
      ticketNumber: newTicket.ticketNumber,
      title: `${newTicket.ticketType} ditugaskan ke ${newTicket.assignedTech}`,
      customerName: newTicket.customerName,
      siaNumber: newTicket.siaNumber,
      clusterName: newTicket.cluster,
      technicianName: newTicket.assignedTech,
      techInitials: newTicket.techInitials,
      attenuationDbm: newTicket.currentAttenuation,
      status: classifyDbm(newTicket.currentAttenuation),
      type: 'Tiket ditugaskan',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    void sendVendorTaskDispatchTelegram({
      chatId: techTelegramChatId,
      vendorDisplayName: newTicket.assignedTech,
      vendorCompany: newTicket.vendorName,
      ticketNumber: newTicket.ticketNumber,
      ticketType: newTicket.ticketType,
      customerName: newTicket.customerName,
      siaNumber: newTicket.siaNumber,
      customerPhone: newTicket.customerPhone,
      complaintSummary: newTicket.complaintSummary,
      serviceAddress: newTicket.serviceAddress,
      locationPlace: newTicket.locationPlace,
      targetLat: newTicket.targetLat,
      targetLng: newTicket.targetLng,
      adminNotes: newTicket.adminNotes,
    }).catch(() => {});

    return newTicket;
  }

  /**
   * Re-assigns vendor or updates dispatch address, landmark/place, and target coordinates on an active ticket.
   */
  public static async updateTicketDispatch(
    ticketId: string,
    input: DispatchTicketInput,
    adminContext?: { id?: string; username?: string },
  ): Promise<DbTicket> {
    const techProfile = input.assignedTechUsername
      ? await this.resolveTechProfile(input.assignedTechUsername)
      : null;

    let techTelegramChatId = techProfile?.telegramChatId || null;
    const fallback = !isStrictLiveMode()
      ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
      : undefined;

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk menugaskan tiket.')) {
      try {
        const updated = await prisma.$transaction(async (tx) => {
          const existing = await tx.ticket.findFirst({
            where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
            include: { customer: { include: { cluster: true, splitter: true } }, assignedTech: true },
          });

          if (!existing) return null;
          if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
            throw new Error(
              `${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket ${existing.ticketNumber} sudah ditutup.`,
            );
          }

          let nextTechId = existing.assignedTechId;
          let nextVendorName = input.vendorName ?? existing.vendorName;
          if (techProfile) {
            const dbTech = await tx.user.findFirst({
              where: {
                OR: [
                  { username: techProfile.username },
                  { fullName: { equals: techProfile.fullName, mode: 'insensitive' } },
                ],
              },
            });
            if (dbTech) {
              nextTechId = dbTech.id;
              techTelegramChatId = dbTech.telegramChatId || techTelegramChatId;
              nextVendorName = input.vendorName || dbTech.vendorCompany || nextVendorName;
            }
          }

          const saved = await tx.ticket.update({
            where: { id: existing.id },
            data: {
              assignedTechId: nextTechId,
              vendorName: nextVendorName,
              complaintSummary: input.complaintSummary ?? existing.complaintSummary,
              customerPhone: input.customerPhone ?? existing.customerPhone,
              serviceAddress: input.serviceAddress ?? existing.serviceAddress,
              locationPlace: input.locationPlace ?? existing.locationPlace,
              targetLat: input.targetLat ?? existing.targetLat,
              targetLng: input.targetLng ?? existing.targetLng,
              adminNotes: input.adminNotes ?? existing.adminNotes,
              dispatchedAt: new Date(),
            },
            include: { customer: { include: { cluster: true, splitter: true } }, assignedTech: true },
          });

          await tx.activityLog.create({
            data: {
              actorUserId: adminContext?.id || existing.createdByAdminId,
              actorRole: 'CS / Admin Lintasarta',
              actionType: 'TICKET_DISPATCH_UPDATED',
              targetEntity: 'ticket',
              targetId: existing.id,
              newPayload: {
                assignedTech: saved.assignedTech?.fullName || null,
                vendorName: saved.vendorName,
                serviceAddress: saved.serviceAddress,
                locationPlace: saved.locationPlace,
              } as Prisma.InputJsonValue,
            },
          });

          return saved;
        });

        if (updated) {
          const dto = mapDbTicketToDto(updated);
          if (fallback) {
            Object.assign(fallback, dto);
          }
          void sendVendorTaskDispatchTelegram({
            chatId: techTelegramChatId,
            vendorDisplayName: dto.assignedTech,
            vendorCompany: dto.vendorName,
            ticketNumber: dto.ticketNumber,
            ticketType: dto.ticketType,
            customerName: dto.customerName,
            siaNumber: dto.siaNumber,
            customerPhone: dto.customerPhone,
            complaintSummary: dto.complaintSummary,
            serviceAddress: dto.serviceAddress,
            locationPlace: dto.locationPlace,
            targetLat: dto.targetLat,
            targetLng: dto.targetLng,
            adminNotes: dto.adminNotes,
          }).catch(() => {});
          return dto;
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes(ERROR_CODES.TICKET_ALREADY_CLOSED)) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memperbarui dispatch tiket di PostgreSQL.');
      }
    }

    if (!fallback) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }
    if (fallback.status === 'Selesai' || fallback.status === 'Dibatalkan') {
      throw new Error(`${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket sudah berstatus ${fallback.status}.`);
    }

    if (techProfile) {
      fallback.assignedTech = techProfile.fullName;
      fallback.assignedTechUsername = techProfile.username;
      fallback.techInitials = getInitials(techProfile.fullName);
      fallback.vendorName = input.vendorName || techProfile.vendorCompany || fallback.vendorName;
    } else if (input.vendorName) {
      fallback.vendorName = input.vendorName;
    }
    if (input.complaintSummary !== undefined) fallback.complaintSummary = input.complaintSummary;
    if (input.customerPhone !== undefined) fallback.customerPhone = input.customerPhone;
    if (input.serviceAddress !== undefined) fallback.serviceAddress = input.serviceAddress;
    if (input.locationPlace !== undefined) fallback.locationPlace = input.locationPlace;
    if (input.targetLat !== undefined) fallback.targetLat = input.targetLat;
    if (input.targetLng !== undefined) fallback.targetLng = input.targetLng;
    if (input.adminNotes !== undefined) fallback.adminNotes = input.adminNotes;
    fallback.dispatchedAt = new Date().toISOString();

    return fallback;
  }

  /**
   * Marks ticket execution as started when Vendor arrives / begins field work at customer site.
   */
  public static async startExecutionByTechnician(
    ticketId: string,
    input: StartTicketExecutionInput,
    techContext?: { id?: string; username?: string },
  ): Promise<DbTicket> {
    let resultDto: DbTicket | null = null;
    const now = new Date();

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk memulai pengerjaan tiket.')) {
      try {
        const dbTicket = await prisma.ticket.findFirst({
          where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
          include: {
            customer: { include: { cluster: true, splitter: true } },
            assignedTech: true,
          },
        });

        if (dbTicket) {
          if (
            techContext?.id &&
            dbTicket.assignedTechId &&
            dbTicket.assignedTechId !== techContext.id
          ) {
            throw new Error(
              `${ERROR_CODES.IDOR_VIOLATION}: Akses ditolak. Tiket ${dbTicket.ticketNumber} ditugaskan ke vendor lain.`,
            );
          }

          if (dbTicket.status === 'COMPLETED' || dbTicket.status === 'CANCELLED') {
            throw new Error(
              `${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket ${dbTicket.ticketNumber} sudah berstatus ${dbTicket.status}.`,
            );
          }

          const updated = await prisma.$transaction(async (tx) => {
            const nextStatus = dbTicket.status === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'IN_PROGRESS';
            const next = await tx.ticket.update({
              where: { id: dbTicket.id },
              data: {
                status: nextStatus,
                startedAt: dbTicket.startedAt ?? now,
              },
              include: {
                customer: { include: { cluster: true, splitter: true } },
                assignedTech: true,
              },
            });

            await tx.activityLog.create({
              data: {
                actorUserId: dbTicket.assignedTechId || techContext?.id || dbTicket.createdByAdminId,
                actorRole: 'Vendor Lapangan',
                actionType: 'TICKET_EXECUTION_STARTED',
                targetEntity: 'ticket',
                targetId: dbTicket.id,
                newPayload: {
                  channel: input.channel,
                  checkInLat: input.checkInLat ?? null,
                  checkInLng: input.checkInLng ?? null,
                  notes: input.notes ?? null,
                  startedAt: (next.startedAt || now).toISOString(),
                } as Prisma.InputJsonValue,
              },
            });

            return next;
          });

          resultDto = mapDbTicketToDto(updated);
        }
      } catch (err) {
        const msg = (err as Error).message || '';
        if (
          msg.includes(ERROR_CODES.IDOR_VIOLATION) ||
          msg.includes(ERROR_CODES.TICKET_ALREADY_CLOSED)
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memulai status tiket di PostgreSQL.');
      }
    }

    const fallback = FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (fallback) {
      if (
        techContext?.username &&
        !matchesTechIdentity(fallback.assignedTech, fallback.assignedTechUsername, techContext.username)
      ) {
        throw new Error(
          `${ERROR_CODES.IDOR_VIOLATION}: Akses ditolak. Tiket ${fallback.ticketNumber} ditugaskan ke vendor lain.`,
        );
      }
      if (fallback.status === 'Selesai' || fallback.status === 'Dibatalkan') {
        throw new Error(
          `${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket ${fallback.ticketNumber} sudah berstatus ${fallback.status}.`,
        );
      }
      if (fallback.status === 'Menunggu') {
        fallback.status = 'Dalam proses';
      }
      if (!fallback.startedAt) {
        fallback.startedAt = now.toISOString();
      }
      resultDto = resultDto || fallback;
    }

    if (!resultDto) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }

    const liveItem: ActivityFeedItem = {
      id: resultDto.id,
      ticketNumber: resultDto.ticketNumber,
      title: `Vendor tiba di lokasi (${input.channel}) - Dalam eksekusi`,
      customerName: resultDto.customerName,
      siaNumber: resultDto.siaNumber,
      clusterName: resultDto.cluster,
      technicianName: resultDto.assignedTech,
      techInitials: resultDto.techInitials,
      attenuationDbm: resultDto.currentAttenuation,
      status: classifyDbm(resultDto.currentAttenuation),
      type: resultDto.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    return resultDto;
  }

  /**
   * Field Technician Work Order Submission with strict integrity guarantees:
   * a. Idempotency Key check: if submission_id already exists in attenuation_histories, returns cached result.
   * b. Anti-Fake GPS: rejects immediately if is_mock_location is true.
   * c. Geofencing: Haversine distance between submitted coordinates and target splitter. Flags if > 100m.
   * d. Database Transaction (prisma.$transaction):
   *    - Concurrency check: ensures splitter port is not already occupied by another ACTIVE customer.
   *    - Updates customer status to ACTIVE (if PSB) and sets current_attenuation.
   *    - Inserts new record into attenuation_histories (APPEND-ONLY, Law 2).
   *    - Inserts audit trail into activity_logs (APPEND-ONLY, Law 2).
   *    - Marks ticket as COMPLETED with server timestamp.
   *    - Publishes event to Redis Pub/Sub for SSE Live Monitoring.
   */
  public static async submitTicketByTechnician(
    ticketId: string,
    input: SubmitTicketInput,
    techContext?: { id?: string; username?: string },
  ) {
    const dbAvailable = await requireLiveDatabase(
      'Koneksi database PostgreSQL diperlukan untuk mengirim laporan hasil lapangan.',
    );
    let preliminaryTicket: {
      id: string;
      ticketNumber: string;
      assignedTechId: string | null;
    } | null = null;

    // ------------------------------------------------------------------
    // 1. TICKET OWNERSHIP VERIFICATION (Rule 1: Anti-IDOR)
    // ------------------------------------------------------------------
    if (dbAvailable) {
      try {
        preliminaryTicket = await prisma.ticket.findFirst({
          where: {
            OR: [{ id: ticketId }, { ticketNumber: ticketId }],
          },
        });

        if (preliminaryTicket) {
          if (
            techContext?.id &&
            preliminaryTicket.assignedTechId &&
            preliminaryTicket.assignedTechId !== techContext.id
          ) {
            throw new Error(
              `${ERROR_CODES.IDOR_VIOLATION}: Akses ditolak. Anda bukan teknisi yang ditugaskan pada tiket ${preliminaryTicket.ticketNumber}.`,
            );
          }
        }
      } catch (err: unknown) {
        const errMsg = (err as Error).message || '';
        if (errMsg.includes(ERROR_CODES.IDOR_VIOLATION)) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memverifikasi kepemilikan tiket di PostgreSQL.');
      }
    }

    // In-memory fallback IDOR verification (only when non-strict / offline mode)
    if (!dbAvailable && !isStrictLiveMode()) {
      const fallbackTicketCheck = FALLBACK_TICKETS.find(
        (t) => t.id === ticketId || t.ticketNumber === ticketId,
      );
      if (fallbackTicketCheck && techContext?.username && fallbackTicketCheck.assignedTech) {
        if (
          !matchesTechIdentity(
            fallbackTicketCheck.assignedTech,
            fallbackTicketCheck.assignedTechUsername,
            techContext.username,
          )
        ) {
          throw new Error(
            `${ERROR_CODES.IDOR_VIOLATION}: Akses ditolak. Anda bukan teknisi yang ditugaskan pada tiket ${fallbackTicketCheck.ticketNumber}.`,
          );
        }
      }
    }

    // ------------------------------------------------------------------
    // 2. IDEMPOTENCY CHECK (Rule 2: Before Ticket Status Check with Cross-Ticket Guard)
    // ------------------------------------------------------------------
    let checkedDbIdempotency = false;
    if (dbAvailable) {
      try {
        const existingHistory = await prisma.attenuationHistory.findUnique({
          where: { submissionId: input.submissionId },
          include: {
            ticket: {
              include: {
                customer: {
                  include: { cluster: true, splitter: true },
                },
                assignedTech: true,
              },
            },
          },
        });
        checkedDbIdempotency = true;

        if (existingHistory) {
          // Cross-Ticket Idempotency Guard (Task 8 Section 1)
          const isSameTicket =
            existingHistory.ticketId === ticketId ||
            existingHistory.ticket?.ticketNumber === ticketId ||
            (preliminaryTicket !== null && existingHistory.ticketId === preliminaryTicket.id);
          const isSameTech =
            !techContext?.id || !existingHistory.techId || existingHistory.techId === techContext.id;

          if (!isSameTicket || !isSameTech) {
            throw new Error(
              `${ERROR_CODES.IDOR_VIOLATION}: submissionId ini telah digunakan pada tiket atau teknisi lain (Cross-Ticket Replay Blocked).`,
            );
          }

          return {
            alreadyProcessed: true,
            ticket: existingHistory.ticket,
            message: 'Laporan telah berhasil diproses sebelumnya (Idempotent response)',
          };
        }
      } catch (dbErr: unknown) {
        const dbErrMsg = (dbErr as Error).message || '';
        if (dbErrMsg.includes(ERROR_CODES.IDOR_VIOLATION)) {
          throw dbErr;
        }
        rethrowIfStrictDatabaseError(dbErr, 'Gagal memeriksa idempotency laporan di PostgreSQL.');
      }
    }

    if (!checkedDbIdempotency) {
      // Check in-memory processed submissions with Cross-Ticket Guard
      const inMemRecord = inMemoryProcessedSubmissions.get(input.submissionId);
      if (inMemRecord) {
        const isSameTicket =
          inMemRecord.ticketId === ticketId ||
          inMemRecord.ticketNumber === ticketId ||
          (preliminaryTicket !== null && inMemRecord.ticketId === preliminaryTicket.id);
        const isSameTech =
          (!techContext?.username ||
            !inMemRecord.techUsername ||
            inMemRecord.techUsername === techContext.username) &&
          (!techContext?.id || !inMemRecord.techId || inMemRecord.techId === techContext.id);

        if (!isSameTicket || !isSameTech) {
          throw new Error(
            `${ERROR_CODES.IDOR_VIOLATION}: submissionId ini telah digunakan pada tiket atau teknisi lain (Cross-Ticket Replay Blocked).`,
          );
        }

        const cachedTicket = FALLBACK_TICKETS.find(
          (t) => t.id === ticketId || t.ticketNumber === ticketId,
        );
        return {
          alreadyProcessed: true,
          ticket: cachedTicket,
          message: 'Laporan telah berhasil diproses sebelumnya (Idempotent response)',
        };
      }
    }

    // ------------------------------------------------------------------
    // 3. TICKET LIFECYCLE STATUS (Rule 3: Reject new submissions on closed tickets)
    // ------------------------------------------------------------------
    if (dbAvailable) {
      try {
        const statusCheckTicket = await prisma.ticket.findFirst({
          where: {
            OR: [{ id: ticketId }, { ticketNumber: ticketId }],
          },
        });

        if (
          statusCheckTicket &&
          (statusCheckTicket.status === 'COMPLETED' || statusCheckTicket.status === 'CANCELLED')
        ) {
          throw new Error(
            `${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket ${statusCheckTicket.ticketNumber} sudah berstatus ${statusCheckTicket.status} dan tidak dapat dimutasi.`,
          );
        }
      } catch (err: unknown) {
        const errMsg = (err as Error).message || '';
        if (
          errMsg.includes(ERROR_CODES.TICKET_ALREADY_CLOSED) ||
          errMsg.includes('tidak dapat dimutasi')
        ) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memverifikasi status siklus tiket di PostgreSQL.');
      }
    }

    // ------------------------------------------------------------------
    // b. ANTI-FAKE GPS CHECK (Law 4 & AGENT.md Section 4)
    // ------------------------------------------------------------------
    if (input.isMockLocation) {
      throw new Error(
        `${ERROR_CODES.MOCK_LOCATION_DETECTED}: Pengiriman ditolak. Perangkat terdeteksi menggunakan Mock Location / Fake GPS.`,
      );
    }

    // ------------------------------------------------------------------
    // c. GEOFENCING & HAVERSINE DISTANCE TO SPLITTER
    // ------------------------------------------------------------------
    let distanceMeters = 0;
    let isLocationFlagged = false;
    let splitterDbId = input.splitterId;
    let splitterCode = input.splitterId;
    let splitterResolvedFromDb = false;

    if (dbAvailable) {
      try {
        const targetSplitter = await prisma.networkSplitter.findFirst({
          where: {
            OR: [{ id: input.splitterId }, { splitterCode: input.splitterId }],
          },
        });

        if (targetSplitter) {
          splitterResolvedFromDb = true;
          splitterDbId = targetSplitter.id;
          splitterCode = targetSplitter.splitterCode;
          distanceMeters = calculateHaversineDistance(
            input.submittedLat,
            input.submittedLng,
            Number(targetSplitter.lat),
            Number(targetSplitter.lng),
          );
          isLocationFlagged = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;

          // GPS Anomaly Detection: identical coordinates indicate GPS spoofing
          const splitterLat = Number(targetSplitter.lat);
          const splitterLng = Number(targetSplitter.lng);
          if (input.submittedLat === splitterLat && input.submittedLng === splitterLng) {
            isLocationFlagged = true;
          }
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal memverifikasi data ODP splitter di PostgreSQL.');
      }
    }

    if (!splitterResolvedFromDb) {
      if (isStrictLiveMode()) {
        throw new Error(`ODP Splitter ${input.splitterId} tidak ditemukan`);
      }
      // In-memory fallback for splitter coordinates (non-strict/test mode only)
      let fallbackSplitterLat = -6.914744;
      let fallbackSplitterLng = 107.60981;
      const fallbackTargetTicket = !isStrictLiveMode()
        ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
        : undefined;
      if (
        input.splitterId === 'ODP-PLB-034' ||
        fallbackTargetTicket?.splitterCode === 'ODP-PLB-034'
      ) {
        fallbackSplitterLat = -2.976383;
        fallbackSplitterLng = 104.741487;
      }
      distanceMeters = calculateHaversineDistance(
        input.submittedLat,
        input.submittedLng,
        fallbackSplitterLat,
        fallbackSplitterLng,
      );
      isLocationFlagged = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;
      // GPS Anomaly Detection: identical coordinates indicate GPS spoofing
      if (
        input.submittedLat === fallbackSplitterLat &&
        input.submittedLng === fallbackSplitterLng
      ) {
        isLocationFlagged = true;
      }
    }

    // ------------------------------------------------------------------
    // e. PREPARE PENDING SUBMISSION PAYLOAD & INTERACTIVE TRANSACTION
    // ------------------------------------------------------------------
    const submissionChannel = input.channel || 'MOBILE';
    const fallbackTechProfile = techContext?.username
      ? await this.resolveTechProfile(techContext.username)
      : null;

    const pendingSubmission: DbTicketPendingSubmission = {
      submissionId: input.submissionId,
      splitterId: splitterDbId,
      splitterCode,
      portNumber: input.portNumber,
      attenuationDbm: input.attenuationDbm,
      photoObjectKey: input.photoObjectKey,
      submittedLat: input.submittedLat,
      submittedLng: input.submittedLng,
      distanceToSplitterM: Math.round(distanceMeters * 100) / 100,
      isLocationFlagged,
      clientRecordedAt: input.clientRecordedAt,
      technicianNotes: input.technicianNotes,
      channel: submissionChannel,
      submittedAt: new Date().toISOString(),
      techUsername: fallbackTechProfile?.username || techContext?.username || 'vendor',
      techFullName: fallbackTechProfile?.fullName || techContext?.username || 'Vendor Lapangan',
    };

    let completedTicketResult: Parameters<typeof mapDbTicketToDto>[0] | null = null;

    if (dbAvailable) {
      try {
        completedTicketResult = await prisma.$transaction(async (tx) => {
          // 1. Fetch Ticket
          const ticket = await tx.ticket.findFirst({
            where: {
              OR: [{ id: ticketId }, { ticketNumber: ticketId }],
            },
            include: {
              customer: true,
              assignedTech: true,
            },
          });

          if (!ticket) {
            throw new Error(`Tiket ${ticketId} tidak ditemukan`);
          }

          // Anti-IDOR: verify technician assignment (Rule 1)
          if (techContext?.id && ticket.assignedTechId && ticket.assignedTechId !== techContext.id) {
            throw new Error(
              `${ERROR_CODES.IDOR_VIOLATION}: Akses ditolak. Anda bukan teknisi yang ditugaskan pada tiket ${ticket.ticketNumber}.`,
            );
          }

          // Anti-Lifecycle violation: reject closed tickets (Rule 3)
          if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
            throw new Error(
              `${ERROR_CODES.TICKET_ALREADY_CLOSED}: Tiket ${ticket.ticketNumber} sudah berstatus ${ticket.status} dan tidak dapat dimutasi.`,
            );
          }

          // 2. Fetch Splitter
          const splitter = await tx.networkSplitter.findFirst({
            where: {
              OR: [{ id: splitterDbId }, { splitterCode: input.splitterId }],
            },
          });

          if (!splitter) {
            throw new Error(`ODP Splitter ${input.splitterId} tidak ditemukan`);
          }

          // Validate port capacity bounds
          if (input.portNumber > splitter.maxPorts) {
            throw new Error(
              `Nomor port ${input.portNumber} melebihi batas kapasitas ODP (${splitter.maxPorts} port)`,
            );
          }

          // 3. Concurrency check: Ensure port is not occupied by another ACTIVE customer
          const occupied = await tx.customer.findFirst({
            where: {
              splitterId: splitter.id,
              portNumber: input.portNumber,
              status: 'ACTIVE',
              id: { not: ticket.customerId },
            },
          });

          if (occupied) {
            throw new Error(
              `${ERROR_CODES.PORT_OCCUPIED}: Port ${input.portNumber} pada ODP ${splitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`,
            );
          }

          // 4. Resolve Tech User
          let techUserId: string | null = ticket.assignedTechId;
          let resolvedTechFull = ticket.assignedTech?.fullName || pendingSubmission.techFullName;
          let resolvedTechUser = ticket.assignedTech?.username || pendingSubmission.techUsername;
          if (!techUserId && techContext?.username) {
            const u = await tx.user.findFirst({ where: { username: techContext.username } });
            if (u) {
              techUserId = u.id;
              resolvedTechFull = u.fullName;
              resolvedTechUser = u.username;
            }
          }
          if (!techUserId) {
            const firstTech = await tx.user.findFirst({ where: { userType: 'TECHNICIAN' } });
            techUserId = firstTech ? firstTech.id : ticket.createdByAdminId;
          }

          const persistedPayload: DbTicketPendingSubmission = {
            ...pendingSubmission,
            splitterId: splitter.id,
            splitterCode: splitter.splitterCode,
            techUsername: resolvedTechUser,
            techFullName: resolvedTechFull,
          };

          // 5. Audit Trail in Activity Log (Law 2: APPEND-ONLY)
          await tx.activityLog.create({
            data: {
              actorUserId: techUserId,
              actorRole: 'Vendor Lapangan',
              actionType: 'TICKET_SUBMITTED_FOR_VERIFICATION',
              targetEntity: 'ticket',
              targetId: ticket.id,
              oldPayload: {
                status: ticket.status,
                oldAttenuation: ticket.customer.currentAttenuation
                  ? Number(ticket.customer.currentAttenuation)
                  : null,
              },
              newPayload: {
                submissionId: input.submissionId,
                status: 'PENDING_APPROVAL',
                channel: submissionChannel,
                attenuationDbm: input.attenuationDbm,
                splitterCode: splitter.splitterCode,
                portNumber: input.portNumber,
                distanceMeters: Math.round(distanceMeters),
                isLocationFlagged,
                technicianNotes: input.technicianNotes,
              },
            },
          });

          // 6. Persist PENDING_APPROVAL & pendingPayload on PostgreSQL Ticket
          const updatedTicket = await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              status: 'PENDING_APPROVAL',
              startedAt: ticket.startedAt ?? new Date(),
              rejectionReason: null,
              pendingPayload: persistedPayload as unknown as Prisma.InputJsonValue,
            },
            include: {
              customer: {
                include: { cluster: true, splitter: true },
              },
              assignedTech: true,
            },
          });

          return updatedTicket;
        });
      } catch (dbErr) {
        // Re-throw validation/concurrency errors immediately
        const errMsg = (dbErr as Error).message;
        if (
          errMsg.includes(ERROR_CODES.PORT_OCCUPIED) ||
          errMsg.includes('kapasitas ODP') ||
          errMsg.includes(ERROR_CODES.MOCK_LOCATION_DETECTED) ||
          errMsg.includes(ERROR_CODES.TICKET_ALREADY_CLOSED) ||
          errMsg.includes(ERROR_CODES.IDOR_VIOLATION) ||
          errMsg.includes('tidak ditemukan')
        ) {
          throw dbErr;
        }
        rethrowIfStrictDatabaseError(dbErr, 'Gagal menyimpan hasil submit teknisi ke PostgreSQL.');
      }
    }

    const ticket = !isStrictLiveMode()
      ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
      : undefined;
    if (ticket) {
      if (ticket.status === 'Selesai' || ticket.status === 'Dibatalkan') {
        throw new Error(
          `Tiket ${ticket.ticketNumber} sudah berstatus ${ticket.status} dan tidak dapat dimutasi.`,
        );
      }
      ticket.status = 'Menunggu verifikasi';
      ticket.rejectionReason = undefined;
      if (!ticket.startedAt) ticket.startedAt = new Date().toISOString();
      ticket.pendingSubmission = {
        ...pendingSubmission,
        techFullName: ticket.assignedTech || pendingSubmission.techFullName,
      };
      inMemoryProcessedSubmissions.set(input.submissionId, {
        submissionId: input.submissionId,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        techId: techContext?.id,
        techUsername: techContext?.username,
      });
    }

    // ------------------------------------------------------------------
    // f. REDIS PUB/SUB & SSE BROADCAST
    // ------------------------------------------------------------------
    const completedDto = completedTicketResult ? mapDbTicketToDto(completedTicketResult) : null;
    const customerName = completedDto?.customerName || ticket?.customerName || 'Pelanggan Lapangan';
    const siaNumber = completedDto?.siaNumber || ticket?.siaNumber || 'SIA-000';
    const clusterName = completedDto?.cluster || ticket?.cluster || 'Cluster Terdaftar';
    const techName =
      completedDto?.assignedTech ||
      ticket?.assignedTech ||
      pendingSubmission.techFullName ||
      'Teknisi Lapangan';
    const ticketTypeStr: 'Pasang baru' | 'Maintenance' =
      (completedDto?.ticketType || ticket?.ticketType) === 'Maintenance'
        ? 'Maintenance'
        : 'Pasang baru';

    const liveItem: ActivityFeedItem = {
      id: completedDto?.id || ticket?.id || ticketId,
      ticketNumber: completedDto?.ticketNumber || ticket?.ticketNumber || ticketId,
      title: 'Laporan teknisi menunggu verifikasi Super Admin',
      customerName,
      siaNumber,
      clusterName,
      technicianName: techName,
      techInitials: getInitials(techName),
      attenuationDbm: input.attenuationDbm,
      status: classifyDbm(input.attenuationDbm),
      type: ticketTypeStr,
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    return {
      alreadyProcessed: false,
      ticket: completedTicketResult || ticket,
      distanceMeters: Math.round(distanceMeters),
      isLocationFlagged,
      message: isLocationFlagged
        ? `Laporan berhasil dikirim dan menunggu persetujuan Super Admin (Peringatan: Jarak teknisi ${Math.round(distanceMeters)}m dari ODP ${splitterCode}).`
        : 'Laporan berhasil dikirim dari mobile app. Menunggu verifikasi dan persetujuan (Accepted) Super Admin sebelum data master diterapkan.',
    };
  }

  /**
   * Super Admin Approval Workflow (Phase 2 Commit):
   * Commits the pending technician submission:
   * 1. Re-validates port concurrency (Law 3).
   * 2. Mutates Customer: sets status ACTIVE, portNumber, splitterId, currentAttenuation (Law 1).
   * 3. Appends AttenuationHistory (APPEND-ONLY, Law 2).
   * 4. Appends ActivityLog: TICKET_APPROVED_BY_ADMIN (Law 2).
   * 5. Updates Ticket: status Selesai / COMPLETED with server timestamp.
   * 6. Updates CustomerService fallback and synchronizes in-memory store.
   * 7. Publishes SSE Live Event to Web Dashboard.
   */
  public static async approveTicketSubmission(
    ticketId: string,
    adminContext?: { id?: string; username?: string },
  ): Promise<DbTicket> {
    const adminUser = adminContext?.username || 'superadmin';
    const adminId = adminContext?.id || 'admin-001';

    let ticket = !isStrictLiveMode()
      ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
      : undefined;
    let techTelegramChatId: string | null = null;
    let resolvedDto: DbTicket | null = null;

    // Resolve authoritative DB ticket & pendingPayload if PostgreSQL is online
    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk menyetujui laporan tiket.')) {
      try {
        const dbTicket = await prisma.ticket.findFirst({
          where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
          include: {
            customer: { include: { cluster: true, splitter: true } },
            assignedTech: true,
          },
        });

        if (dbTicket) {
          techTelegramChatId = dbTicket.assignedTech?.telegramChatId || null;
          const dbPending = parsePendingPayload(dbTicket.pendingPayload);
          const effectivePending = dbPending || ticket?.pendingSubmission;
          const finalAttenuation = effectivePending
            ? effectivePending.attenuationDbm
            : ticket?.currentAttenuation ??
              (dbTicket.customer.currentAttenuation
                ? Number(dbTicket.customer.currentAttenuation)
                : -20.0);
          const finalSplitter =
            effectivePending?.splitterCode ||
            ticket?.splitterCode ||
            dbTicket.customer.splitter?.splitterCode ||
            'ODP-BDG-01';
          const finalPort =
            effectivePending?.portNumber || ticket?.portNumber || dbTicket.customer.portNumber || 1;

          const updatedDbTicket = await prisma.$transaction(async (tx) => {
            const splitter = await tx.networkSplitter.findFirst({
              where: {
                OR: [{ id: finalSplitter }, { splitterCode: finalSplitter }],
              },
            });

            if (splitter) {
              const occupied = await tx.customer.findFirst({
                where: {
                  splitterId: splitter.id,
                  portNumber: finalPort,
                  status: 'ACTIVE',
                  id: { not: dbTicket.customerId },
                },
              });

              if (occupied) {
                throw new Error(
                  `${ERROR_CODES.PORT_OCCUPIED}: Port ${finalPort} pada ODP ${splitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName}).`,
                );
              }

              await tx.customer.update({
                where: { id: dbTicket.customerId },
                data: {
                  status: 'ACTIVE',
                  splitterId: splitter.id,
                  portNumber: finalPort,
                  currentAttenuation: finalAttenuation,
                  lat: dbTicket.customer.lat ?? dbTicket.targetLat ?? undefined,
                  lng: dbTicket.customer.lng ?? dbTicket.targetLng ?? undefined,
                  updatedAt: new Date(),
                },
              });

              if (effectivePending) {
                await tx.attenuationHistory.create({
                  data: {
                    submissionId: effectivePending.submissionId,
                    ticketId: dbTicket.id,
                    customerId: dbTicket.customerId,
                    techId: dbTicket.assignedTechId || adminId,
                    newAttenuation: finalAttenuation,
                    splitterId: splitter.id,
                    portNumber: finalPort,
                    photoObjectKey: effectivePending.photoObjectKey,
                    submittedLat: effectivePending.submittedLat,
                    submittedLng: effectivePending.submittedLng,
                    distanceToSplitterM: effectivePending.distanceToSplitterM,
                    isLocationFlagged: effectivePending.isLocationFlagged,
                    clientRecordedAt: effectivePending.clientRecordedAt
                      ? new Date(effectivePending.clientRecordedAt)
                      : null,
                  },
                });
              }
            }

            await tx.activityLog.create({
              data: {
                actorUserId: adminId,
                actorRole: 'CS / Pusat Lintasarta',
                actionType: 'TICKET_APPROVED_BY_ADMIN',
                targetEntity: 'ticket',
                targetId: dbTicket.id,
                newPayload: {
                  status: 'COMPLETED',
                  approvedBy: adminUser,
                  attenuationDbm: finalAttenuation,
                  splitterCode: finalSplitter,
                  portNumber: finalPort,
                },
              },
            });

            return await tx.ticket.update({
              where: { id: dbTicket.id },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                pendingPayload: Prisma.DbNull,
                rejectionReason: null,
              },
              include: {
                customer: { include: { cluster: true, splitter: true } },
                assignedTech: true,
              },
            });
          });

          resolvedDto = mapDbTicketToDto(updatedDbTicket);
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        if (errMsg.includes(ERROR_CODES.PORT_OCCUPIED)) {
          throw err;
        }
        rethrowIfStrictDatabaseError(err, 'Gagal memproses persetujuan tiket di PostgreSQL.');
      }
    }

    if (!resolvedDto && !ticket) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }

    if (ticket) {
      const pending = ticket.pendingSubmission;
      const finalAttenuation = pending
        ? pending.attenuationDbm
        : resolvedDto?.currentAttenuation ?? ticket.currentAttenuation;
      const finalSplitter = pending
        ? pending.splitterCode
        : resolvedDto?.splitterCode || ticket.splitterCode || 'ODP-BDG-01';
      const finalPort = pending
        ? pending.portNumber
        : resolvedDto?.portNumber || ticket.portNumber || 1;

      ticket.status = 'Selesai';
      ticket.currentAttenuation = finalAttenuation;
      ticket.splitterCode = finalSplitter;
      ticket.portNumber = finalPort;
      ticket.completedAt = resolvedDto?.completedAt || new Date().toISOString();
      ticket.rejectionReason = undefined;
      ticket.pendingSubmission = undefined;
    }

    const finalTicket = resolvedDto || ticket!;
    if (!techTelegramChatId && finalTicket.assignedTechUsername) {
      const techAcc = await AuthService.resolveAccountByUsername(finalTicket.assignedTechUsername);
      techTelegramChatId = techAcc?.telegramChatId || null;
    }

    if (!isStrictLiveMode()) {
      CustomerService.updateCustomerFromApproval(finalTicket.siaNumber, {
        status: 'ACTIVE',
        splitterCode: finalTicket.splitterCode,
        portNumber: finalTicket.portNumber,
        currentAttenuation: finalTicket.currentAttenuation,
      });
    }

    const liveItem: ActivityFeedItem = {
      id: finalTicket.id,
      ticketNumber: finalTicket.ticketNumber,
      title: `${finalTicket.ticketType} Telah Disetujui Pusat Lintasarta`,
      customerName: finalTicket.customerName,
      siaNumber: finalTicket.siaNumber,
      clusterName: finalTicket.cluster,
      technicianName: finalTicket.assignedTech,
      techInitials: finalTicket.techInitials,
      attenuationDbm: finalTicket.currentAttenuation,
      status: classifyDbm(finalTicket.currentAttenuation),
      type: finalTicket.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    void sendVendorVerificationResultTelegram({
      chatId: techTelegramChatId,
      ticketNumber: finalTicket.ticketNumber,
      customerName: finalTicket.customerName,
      approved: true,
      reviewedBy: adminUser,
    }).catch(() => {});

    return finalTicket;
  }

  /**
   * Lintasarta Rejection Workflow:
   * Rejects the vendor submission and sends ticket back to IN_PROGRESS for revision.
   */
  public static async rejectTicketSubmission(
    ticketId: string,
    reason = 'Data redaman atau bukti foto OPM belum memenuhi standar operasional',
    adminContext?: { id?: string; username?: string },
  ): Promise<DbTicket> {
    const adminUser = adminContext?.username || 'superadmin';
    const adminId = adminContext?.id || 'admin-001';

    const ticket = !isStrictLiveMode()
      ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
      : undefined;
    let resolvedDto: DbTicket | null = null;
    let techTelegramChatId: string | null = null;

    if (await requireLiveDatabase('Koneksi database PostgreSQL diperlukan untuk menolak laporan tiket.')) {
      try {
        const dbTicket = await prisma.ticket.findFirst({
          where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
          include: { assignedTech: true },
        });
        if (dbTicket) {
          techTelegramChatId = dbTicket.assignedTech?.telegramChatId || null;
          const updatedDbTicket = await prisma.$transaction(async (tx) => {
            await tx.activityLog.create({
              data: {
                actorUserId: adminId,
                actorRole: 'CS / Pusat Lintasarta',
                actionType: 'TICKET_REJECTED_BY_ADMIN',
                targetEntity: 'ticket',
                targetId: dbTicket.id,
                newPayload: {
                  status: 'IN_PROGRESS',
                  rejectedBy: adminUser,
                  reason,
                },
              },
            });

            return await tx.ticket.update({
              where: { id: dbTicket.id },
              data: {
                status: 'IN_PROGRESS',
                rejectionReason: reason,
                pendingPayload: Prisma.DbNull,
              },
              include: {
                customer: { include: { cluster: true, splitter: true } },
                assignedTech: true,
              },
            });
          });
          resolvedDto = mapDbTicketToDto(updatedDbTicket);
        }
      } catch (err) {
        rethrowIfStrictDatabaseError(err, 'Gagal mencatat penolakan tiket ke PostgreSQL.');
      }
    }

    if (!resolvedDto && !ticket) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }

    if (ticket) {
      ticket.status = 'Dalam proses';
      ticket.rejectionReason = reason;
      ticket.pendingSubmission = undefined;
    }

    const finalTicket = resolvedDto || ticket!;
    if (!techTelegramChatId && finalTicket.assignedTechUsername) {
      const techAcc = await AuthService.resolveAccountByUsername(finalTicket.assignedTechUsername);
      techTelegramChatId = techAcc?.telegramChatId || null;
    }

    const liveItem: ActivityFeedItem = {
      id: finalTicket.id,
      ticketNumber: finalTicket.ticketNumber,
      title: `${finalTicket.ticketType} Ditolak - Perlu Revisi Vendor`,
      customerName: finalTicket.customerName,
      siaNumber: finalTicket.siaNumber,
      clusterName: finalTicket.cluster,
      technicianName: finalTicket.assignedTech,
      techInitials: finalTicket.techInitials,
      attenuationDbm: finalTicket.currentAttenuation,
      status: 'Critical',
      type: finalTicket.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    void sendVendorVerificationResultTelegram({
      chatId: techTelegramChatId,
      ticketNumber: finalTicket.ticketNumber,
      customerName: finalTicket.customerName,
      approved: false,
      reason,
      reviewedBy: adminUser,
    }).catch(() => {});

    return finalTicket;
  }

  /**
   * Alias for technician ticket submission to maintain backward route compatibility.
   */
  public static async submitTicket(
    ticketId: string,
    input: SubmitTicketInput,
    techUsername = 'andi.pratama',
  ) {
    return this.submitTicketByTechnician(ticketId, input, { username: techUsername });
  }

  public static async markTicketCompletedDemo(ticketNumber: string) {
    if (isStrictLiveMode() && process.env.ENABLE_DEMO_SIMULATION !== 'true') {
      throw new Error('Simulasi demo dinonaktifkan pada mode data langsung (STRICT_LIVE_DATA).');
    }
    const ticket = FALLBACK_TICKETS.find((t) => t.ticketNumber === ticketNumber);
    if (!ticket) throw new Error('Tiket tidak ditemukan');
    ticket.status = 'Selesai';
    ticket.completedAt = new Date().toISOString();
    return ticket;
  }

  /**
   * Simulates an incoming field submission from a mobile technician to test Super Admin approval.
   */
  public static async simulateTechnicianSubmission(ticketId?: string) {
    if (isStrictLiveMode() && process.env.ENABLE_DEMO_SIMULATION !== 'true') {
      throw new Error('Simulasi demo dinonaktifkan pada mode data langsung (STRICT_LIVE_DATA).');
    }
    let target = ticketId
      ? FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId)
      : FALLBACK_TICKETS.find((t) => t.status === 'Dalam proses' || t.status === 'Menunggu');

    if (!target) {
      target = FALLBACK_TICKETS[0];
    }

    const submissionId = `sub-sim-${Date.now()}`;
    const attenuation = -19.4;
    const splitterCode = target.splitterCode || 'ODP-BDG-03';
    const portNumber = target.portNumber || 2;

    target.status = 'Menunggu verifikasi';
    target.pendingSubmission = {
      submissionId,
      splitterId: splitterCode,
      splitterCode,
      portNumber,
      attenuationDbm: attenuation,
      photoObjectKey: `opm-proofs/2025/02/${target.id}-opm.webp`,
      submittedLat: -6.9147,
      submittedLng: 107.6098,
      distanceToSplitterM: 16,
      isLocationFlagged: false,
      technicianNotes: `Penggantian drop core dan splicing pigtail di ODP ${splitterCode} port ${portNumber} selesai. Redaman stabil di ${attenuation} dBm (Normal).`,
      submittedAt: new Date().toISOString(),
      techUsername: target.assignedTech.toLowerCase().replace(/\s+/g, '.'),
      techFullName: target.assignedTech,
    };

    const liveItem: ActivityFeedItem = {
      id: target.id,
      ticketNumber: target.ticketNumber,
      title: 'Laporan teknisi menunggu verifikasi Super Admin',
      customerName: target.customerName,
      siaNumber: target.siaNumber,
      clusterName: target.cluster,
      technicianName: target.assignedTech,
      techInitials: target.techInitials,
      attenuationDbm: attenuation,
      status: classifyDbm(attenuation),
      type: target.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    return target;
  }
}
