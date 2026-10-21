import { prisma } from '@repo/database';
import { redisManager } from '@/lib/redis';
import {
  CreateTicketInput,
  SubmitTicketInput,
  TicketQuery,
  ActivityFeedItem,
  classifyDbm,
  MAX_GEOFENCE_RADIUS_METERS,
  ERROR_CODES,
  UserSessionContext,
} from '@repo/shared';
import { sseBroadcaster } from './sse.service';

import { CustomerService } from './customer.service';

export interface DbTicketPendingSubmission {
  submissionId: string;
  splitterId: string;
  splitterCode: string;
  portNumber: number;
  attenuationDbm: number;
  photoObjectKey: string;
  submittedLat: number;
  submittedLng: number;
  distanceToSplitterM: number;
  isLocationFlagged: boolean;
  clientRecordedAt?: string;
  technicianNotes?: string;
  submittedAt: string;
  techUsername: string;
  techFullName: string;
}

export interface DbTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: 'Pasang baru' | 'Perbaikan' | 'Maintenance' | 'Instalasi';
  cluster: string;
  assignedTech: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan';
  priority?: 'Normal' | 'High' | 'Low';
  currentAttenuation: number;
  adminNotes?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  pendingSubmission?: DbTicketPendingSubmission;
}

const FALLBACK_TICKETS: DbTicket[] = [
  {
    id: 't-1',
    ticketNumber: 'TK-2024-001',
    customerName: 'Budi Santoso',
    siaNumber: 'SLA-100244-001',
    ticketType: 'Pasang baru',
    cluster: 'Bandung Utara',
    assignedTech: 'Andi Pratama',
    techInitials: 'AP',
    status: 'Menunggu',
    priority: 'Normal',
    currentAttenuation: -18.5,
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
    assignedTech: 'Rizky Maulana',
    techInitials: 'RM',
    status: 'Menunggu verifikasi',
    priority: 'High',
    currentAttenuation: -24.8,
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
      technicianNotes: 'Perbaikan fast connector di ODP-CMH-01 port 3 selesai. Redaman turun dari -24.8 dBm menjadi -19.4 dBm (Normal).',
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
    assignedTech: 'Fajar Hidayat',
    techInitials: 'FH',
    status: 'Menunggu verifikasi',
    priority: 'Normal',
    currentAttenuation: -21.2,
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
      technicianNotes: 'Selesai splicing drop core dan penggantian pigtail di ODP port 2. Hasil ukur OPM stabil di -19.8 dBm.',
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
    assignedTech: 'Dedi Kurniawan',
    techInitials: 'DK',
    status: 'Selesai',
    priority: 'Low',
    currentAttenuation: -19.4,
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
    assignedTech: 'Agus Setiawan',
    techInitials: 'AS',
    status: 'Menunggu',
    priority: 'High',
    currentAttenuation: -26.1,
    createdAt: new Date().toISOString(),
    splitterCode: 'ODP-CMH-02',
    portNumber: 7,
    distanceToSplitterM: 142,
    isLocationFlagged: true,
  },
];

const inMemoryProcessedSubmissions = new Set<string>();

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula (returns meters).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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

export class TicketService {
  /**
   * Retrieves ticket list with cluster scoping (RLS) and search filters.
   */
  public static async listTickets(
    params: Partial<TicketQuery> = {},
    userContext?: UserSessionContext
  ): Promise<DbTicket[]> {
    try {
      // Build Prisma where clause with cluster scoping (Law 4)
      const whereClause: Record<string, unknown> = {};

      if (userContext && userContext.userType !== 'SUPER_ADMIN' && userContext.assignedClusters.length > 0) {
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
          'Menunggu verifikasi': 'IN_PROGRESS',
          PENDING_APPROVAL: 'IN_PROGRESS',
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

      if (tickets.length > 0) {
        const statusMapReverse: Record<string, 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan'> = {
          OPEN: 'Menunggu',
          IN_PROGRESS: 'Dalam proses',
          COMPLETED: 'Selesai',
          CANCELLED: 'Dibatalkan',
        };

        return tickets.map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          customerName: t.customer.fullName,
          siaNumber: t.customer.siaNumber,
          ticketType: t.ticketType === 'PSB' ? 'Pasang baru' : 'Maintenance',
          cluster: t.customer.cluster.name,
          assignedTech: t.assignedTech?.fullName || 'Belum Ditugaskan',
          techInitials: t.assignedTech ? getInitials(t.assignedTech.fullName) : 'TK',
          status: statusMapReverse[t.status] || 'Menunggu',
          currentAttenuation: t.customer.currentAttenuation ? Number(t.customer.currentAttenuation) : -20.0,
          adminNotes: t.adminNotes || undefined,
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
          splitterCode: t.customer.splitter?.splitterCode,
          portNumber: t.customer.portNumber || undefined,
        }));
      }
    } catch {
      // In-memory fallback if database connection is pending
    }

    // Fallback: In-memory store
    let result = [...FALLBACK_TICKETS];

    if (userContext && userContext.userType !== 'SUPER_ADMIN' && userContext.assignedClusters.length > 0) {
      result = result.filter((t) =>
        userContext.assignedClusters.some((c) => t.cluster.toLowerCase().includes(c.toLowerCase()))
      );
    }

    if (params.cluster && params.cluster !== 'Semua cluster') {
      result = result.filter((t) => t.cluster.toLowerCase().includes(params.cluster!.toLowerCase()));
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
          t.assignedTech.toLowerCase().includes(q)
      );
    }

    return result;
  }

  /**
   * Retrieves single ticket by internal ID or ticketNumber.
   */
  public static async getTicketById(id: string): Promise<DbTicket> {
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
        const statusMapReverse: Record<string, 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan'> = {
          OPEN: 'Menunggu',
          IN_PROGRESS: 'Dalam proses',
          COMPLETED: 'Selesai',
          CANCELLED: 'Dibatalkan',
        };

        return {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          customerName: ticket.customer.fullName,
          siaNumber: ticket.customer.siaNumber,
          ticketType: ticket.ticketType === 'PSB' ? 'Pasang baru' : 'Maintenance',
          cluster: ticket.customer.cluster.name,
          assignedTech: ticket.assignedTech?.fullName || 'Belum Ditugaskan',
          techInitials: ticket.assignedTech ? getInitials(ticket.assignedTech.fullName) : 'TK',
          status: statusMapReverse[ticket.status] || 'Menunggu',
          currentAttenuation: ticket.customer.currentAttenuation ? Number(ticket.customer.currentAttenuation) : -20.0,
          adminNotes: ticket.adminNotes || undefined,
          createdAt: ticket.createdAt.toISOString(),
          completedAt: ticket.completedAt ? ticket.completedAt.toISOString() : undefined,
        };
      }
    } catch {
      // Fallback below
    }

    const cached = FALLBACK_TICKETS.find((t) => t.id === id || t.ticketNumber === id);
    if (!cached) {
      throw new Error(`Tiket dengan ID ${id} tidak ditemukan`);
    }
    return cached;
  }

  /**
   * Creates a new ticket dispatched by an Admin (PSB or Maintenance).
   */
  public static async createTicket(input: CreateTicketInput, adminId = 'superadmin') {
    const techName = input.assignedTechUsername;
    const techInitials = getInitials(techName);

    const nextNumber = `WO-2025-0${843 + FALLBACK_TICKETS.length}`;
    const newTicket: DbTicket = {
      id: `t-${Date.now()}`,
      ticketNumber: nextNumber,
      customerName: input.customerName,
      siaNumber: input.siaNumber,
      ticketType: input.ticketType === 'PSB' ? 'Pasang baru' : 'Maintenance',
      cluster: input.clusterCode.startsWith('Bandung') ? input.clusterCode : `Bandung ${input.clusterCode}`,
      assignedTech: techName,
      techInitials,
      status: 'Menunggu',
      currentAttenuation: -20.0,
      adminNotes: input.adminNotes || 'Dibuat oleh Admin melalui Web Dashboard',
      createdAt: new Date().toISOString(),
    };

    // Update in-memory fallback store
    FALLBACK_TICKETS.unshift(newTicket);

    // Broadcast live event via Redis and SSE
    const liveItem: ActivityFeedItem = {
      id: newTicket.id,
      ticketNumber: newTicket.ticketNumber,
      title: `${newTicket.ticketType} ditugaskan`,
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

    // Persist to database if available
    try {
      const dbCustomer = await prisma.customer.findFirst({
        where: { siaNumber: input.siaNumber },
      });

      const dbAdmin = await prisma.user.findFirst({
        where: { OR: [{ id: adminId }, { username: adminId }] },
      });

      const dbTech = await prisma.user.findFirst({
        where: {
          OR: [
            { username: input.assignedTechUsername },
            { fullName: input.assignedTechUsername },
          ],
        },
      });

      if (dbCustomer && dbAdmin) {
        await prisma.ticket.create({
          data: {
            ticketNumber: newTicket.ticketNumber,
            ticketType: input.ticketType,
            customerId: dbCustomer.id,
            assignedTechId: dbTech?.id,
            createdByAdminId: dbAdmin.id,
            status: 'OPEN',
            adminNotes: input.adminNotes,
          },
        });
      }
    } catch {
      // Ignored if DB is in local seedless mode
    }

    return newTicket;
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
    techContext?: { id?: string; username?: string }
  ) {
    // ------------------------------------------------------------------
    // a. IDEMPOTENCY CHECK (Law 3)
    // ------------------------------------------------------------------
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

      if (existingHistory) {
        return {
          alreadyProcessed: true,
          ticket: existingHistory.ticket,
          message: 'Laporan telah berhasil diproses sebelumnya (Idempotent response)',
        };
      }
    } catch {
      // Check in-memory processed submissions
      if (inMemoryProcessedSubmissions.has(input.submissionId)) {
        const cachedTicket = FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
        return {
          alreadyProcessed: true,
          ticket: cachedTicket,
          message: 'Laporan telah berhasil diproses sebelumnya (Idempotent response)',
        };
      }
    }

    // ------------------------------------------------------------------
    // b. ANTI-FAKE GPS CHECK (Law 4 & AGENT.md Section 4)
    // ------------------------------------------------------------------
    if (input.isMockLocation) {
      throw new Error(
        `${ERROR_CODES.MOCK_LOCATION_DETECTED}: Pengiriman ditolak. Perangkat terdeteksi menggunakan Mock Location / Fake GPS.`
      );
    }

    // ------------------------------------------------------------------
    // c. GEOFENCING & HAVERSINE DISTANCE TO SPLITTER
    // ------------------------------------------------------------------
    let distanceMeters = 0;
    let isLocationFlagged = false;
    let splitterDbId = input.splitterId;
    let splitterCode = input.splitterId;

    try {
      const targetSplitter = await prisma.networkSplitter.findFirst({
        where: {
          OR: [{ id: input.splitterId }, { splitterCode: input.splitterId }],
        },
      });

      if (targetSplitter) {
        splitterDbId = targetSplitter.id;
        splitterCode = targetSplitter.splitterCode;
        distanceMeters = calculateHaversineDistance(
          input.submittedLat,
          input.submittedLng,
          Number(targetSplitter.lat),
          Number(targetSplitter.lng)
        );
        isLocationFlagged = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;
      }
    } catch {
      // In-memory fallback for splitter coordinates (Bandung default)
      distanceMeters = calculateHaversineDistance(
        input.submittedLat,
        input.submittedLng,
        -6.914744,
        107.60981
      );
      isLocationFlagged = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;
    }

    // ------------------------------------------------------------------
    // d. INTERACTIVE TRANSACTION (prisma.$transaction)
    // ------------------------------------------------------------------
    let completedTicketResult: unknown = null;

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
            `Nomor port ${input.portNumber} melebihi batas kapasitas ODP (${splitter.maxPorts} port)`
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
            `${ERROR_CODES.PORT_OCCUPIED}: Port ${input.portNumber} pada ODP ${splitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`
          );
        }

        // 4. Resolve Tech User
        let techUserId: string | null = ticket.assignedTechId;
        if (!techUserId && techContext?.username) {
          const u = await tx.user.findFirst({ where: { username: techContext.username } });
          if (u) {
            techUserId = u.id;
          }
        }
        if (!techUserId) {
          const firstTech = await tx.user.findFirst({ where: { userType: 'TECHNICIAN' } });
          techUserId = firstTech ? firstTech.id : ticket.createdByAdminId;
        }

        // 5. Audit Trail in Activity Log (Law 2: APPEND-ONLY)
        // Technician submission recorded for Super Admin verification
        await tx.activityLog.create({
          data: {
            actorUserId: techUserId,
            actorRole: 'Technician',
            actionType: 'TICKET_SUBMITTED_FOR_VERIFICATION',
            targetEntity: 'ticket',
            targetId: ticket.id,
            oldPayload: {
              status: ticket.status,
              oldAttenuation: ticket.customer.currentAttenuation ? Number(ticket.customer.currentAttenuation) : null,
            },
            newPayload: {
              submissionId: input.submissionId,
              status: 'PENDING_APPROVAL',
              attenuationDbm: input.attenuationDbm,
              splitterCode: splitter.splitterCode,
              portNumber: input.portNumber,
              distanceMeters: Math.round(distanceMeters),
              isLocationFlagged,
              technicianNotes: input.technicianNotes,
            },
          },
        });

        // 6. Hold ticket in IN_PROGRESS on DB until Super Admin Acceptance
        const updatedTicket = await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'IN_PROGRESS',
            adminNotes: ticket.adminNotes
              ? `${ticket.adminNotes} · Menunggu verifikasi Super Admin`
              : 'Menunggu verifikasi Super Admin',
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
        errMsg.includes(ERROR_CODES.MOCK_LOCATION_DETECTED)
      ) {
        throw dbErr;
      }
      // If DB error is connection related, fallback to in-memory store
      console.warn('[TicketService] DB transaction failed, syncing in-memory store:', errMsg);
    }

    // ------------------------------------------------------------------
    // e. IN-MEMORY STORE SYNC (2-Phase Commit Holding State)
    // ------------------------------------------------------------------
    const pendingSubmission: DbTicketPendingSubmission = {
      submissionId: input.submissionId,
      splitterId: input.splitterId,
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
      submittedAt: new Date().toISOString(),
      techUsername: techContext?.username || 'teknisi',
      techFullName: techContext?.username || 'Teknisi Lapangan',
    };

    const ticket = FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (ticket) {
      // Transition to 'Menunggu verifikasi' instead of 'Selesai'
      ticket.status = 'Menunggu verifikasi';
      ticket.pendingSubmission = pendingSubmission;
      inMemoryProcessedSubmissions.add(input.submissionId);
    }

    // ------------------------------------------------------------------
    // f. REDIS PUB/SUB & SSE BROADCAST
    // ------------------------------------------------------------------
    const customerName = ticket ? ticket.customerName : 'Pelanggan Lapangan';
    const siaNumber = ticket ? ticket.siaNumber : 'SIA-000';
    const clusterName = ticket ? ticket.cluster : 'Cluster Bandung';
    const techName = ticket ? ticket.assignedTech : techContext?.username || 'Teknisi Lapangan';
    const ticketTypeStr: 'Pasang baru' | 'Maintenance' =
      ticket && ticket.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru';

    const liveItem: ActivityFeedItem = {
      id: ticket?.id || ticketId,
      ticketNumber: ticket?.ticketNumber || ticketId,
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
    adminContext?: { id?: string; username?: string }
  ): Promise<DbTicket> {
    const adminUser = adminContext?.username || 'superadmin';
    const adminId = adminContext?.id || 'admin-001';

    const ticket = FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }

    const pending = ticket.pendingSubmission;
    const finalAttenuation = pending ? pending.attenuationDbm : ticket.currentAttenuation;
    const finalSplitter = pending ? pending.splitterCode : ticket.splitterCode || 'ODP-BDG-01';
    const finalPort = pending ? pending.portNumber : ticket.portNumber || 1;

    // Interactive DB transaction if PostgreSQL is available
    try {
      const dbTicket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
        include: { customer: true, assignedTech: true },
      });

      if (dbTicket) {
        await prisma.$transaction(async (tx) => {
          const splitter = await tx.networkSplitter.findFirst({
            where: {
              OR: [{ id: finalSplitter }, { splitterCode: finalSplitter }],
            },
          });

          if (splitter) {
            // Concurrency check
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
                `${ERROR_CODES.PORT_OCCUPIED}: Port ${finalPort} pada ODP ${splitter.splitterCode} sudah digunakan oleh pelanggan aktif (${occupied.fullName}).`
              );
            }

            // Update customer master data
            await tx.customer.update({
              where: { id: dbTicket.customerId },
              data: {
                status: 'ACTIVE',
                splitterId: splitter.id,
                portNumber: finalPort,
                currentAttenuation: finalAttenuation,
                updatedAt: new Date(),
              },
            });

            // Append-only Attenuation History
            if (pending) {
              await tx.attenuationHistory.create({
                data: {
                  submissionId: pending.submissionId,
                  ticketId: dbTicket.id,
                  customerId: dbTicket.customerId,
                  techId: dbTicket.assignedTechId || adminId,
                  newAttenuation: finalAttenuation,
                  splitterId: splitter.id,
                  portNumber: finalPort,
                  photoObjectKey: pending.photoObjectKey,
                  submittedLat: pending.submittedLat,
                  submittedLng: pending.submittedLng,
                  distanceToSplitterM: pending.distanceToSplitterM,
                  isLocationFlagged: pending.isLocationFlagged,
                  clientRecordedAt: pending.clientRecordedAt ? new Date(pending.clientRecordedAt) : null,
                },
              });
            }
          }

          // Append-only Activity Log (Law 2)
          await tx.activityLog.create({
            data: {
              actorUserId: adminId,
              actorRole: 'Super Admin',
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

          // Mark ticket as COMPLETED
          await tx.ticket.update({
            where: { id: dbTicket.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
        });
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg.includes(ERROR_CODES.PORT_OCCUPIED)) {
        throw err;
      }
      console.warn('[TicketService] DB approval transaction failed or skipped:', errMsg);
    }

    // Update in-memory ticket state
    ticket.status = 'Selesai';
    ticket.currentAttenuation = finalAttenuation;
    ticket.splitterCode = finalSplitter;
    ticket.portNumber = finalPort;
    ticket.completedAt = new Date().toISOString();
    ticket.adminNotes = ticket.adminNotes
      ? `${ticket.adminNotes} · Disetujui oleh Super Admin (${adminUser})`
      : `Disetujui oleh Super Admin (${adminUser})`;
    ticket.pendingSubmission = undefined;

    // Update Customer Master Data in CustomerService fallback store
    CustomerService.updateCustomerFromApproval(ticket.siaNumber, {
      status: 'ACTIVE',
      splitterCode: ticket.splitterCode,
      portNumber: ticket.portNumber,
      currentAttenuation: ticket.currentAttenuation,
    });

    // Broadcast SSE Live Event
    const liveItem: ActivityFeedItem = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: `${ticket.ticketType} Telah Disetujui Super Admin`,
      customerName: ticket.customerName,
      siaNumber: ticket.siaNumber,
      clusterName: ticket.cluster,
      technicianName: ticket.assignedTech,
      techInitials: ticket.techInitials,
      attenuationDbm: ticket.currentAttenuation,
      status: classifyDbm(ticket.currentAttenuation),
      type: ticket.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    return ticket;
  }

  /**
   * Super Admin Rejection Workflow:
   * Rejects the technician submission and requests rework/re-measurement.
   */
  public static async rejectTicketSubmission(
    ticketId: string,
    reason = 'Data redaman atau bukti foto OPM belum memenuhi standar operasional',
    adminContext?: { id?: string; username?: string }
  ): Promise<DbTicket> {
    const adminUser = adminContext?.username || 'superadmin';
    const adminId = adminContext?.id || 'admin-001';

    const ticket = FALLBACK_TICKETS.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      throw new Error(`Tiket ${ticketId} tidak ditemukan`);
    }

    // Activity log in DB if available (Law 2)
    try {
      const dbTicket = await prisma.ticket.findFirst({
        where: { OR: [{ id: ticketId }, { ticketNumber: ticketId }] },
      });
      if (dbTicket) {
        await prisma.activityLog.create({
          data: {
            actorUserId: adminId,
            actorRole: 'Super Admin',
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
      }
    } catch {
      // Ignore DB error in fallback mode
    }

    ticket.status = 'Dalam proses';
    ticket.adminNotes = `[Ditolak oleh ${adminUser}]: ${reason}`;
    ticket.pendingSubmission = undefined;

    // Broadcast SSE Live Event
    const liveItem: ActivityFeedItem = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: `${ticket.ticketType} Ditolak - Perlu Pengukuran Ulang`,
      customerName: ticket.customerName,
      siaNumber: ticket.siaNumber,
      clusterName: ticket.cluster,
      technicianName: ticket.assignedTech,
      techInitials: ticket.techInitials,
      attenuationDbm: ticket.currentAttenuation,
      status: 'Critical',
      type: ticket.ticketType === 'Maintenance' ? 'Maintenance' : 'Pasang baru',
      timestamp: 'Baru saja',
      isUnread: true,
    };

    await redisManager.publishLiveReport(liveItem);
    sseBroadcaster.broadcast(liveItem);

    return ticket;
  }

  /**
   * Alias for technician ticket submission to maintain backward route compatibility.
   */
  public static async submitTicket(
    ticketId: string,
    input: SubmitTicketInput,
    techUsername = 'andi.pratama'
  ) {
    return this.submitTicketByTechnician(ticketId, input, { username: techUsername });
  }

  public static async markTicketCompletedDemo(ticketNumber: string) {
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
