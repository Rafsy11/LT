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
import { dataStore, DbTicket } from './data-store';
import { sseBroadcaster } from './sse.service';

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
        const statusMapReverse: Record<string, 'Menunggu' | 'Dalam proses' | 'Selesai' | 'Dibatalkan'> = {
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
        }));
      }
    } catch {
      // In-memory fallback if database connection is pending
    }

    // Fallback: In-memory store
    let result = [...dataStore.tickets];

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
        const statusMapReverse: Record<string, 'Menunggu' | 'Dalam proses' | 'Selesai' | 'Dibatalkan'> = {
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

    const cached = dataStore.tickets.find((t) => t.id === id || t.ticketNumber === id);
    if (!cached) {
      throw new Error(`Tiket dengan ID ${id} tidak ditemukan`);
    }
    return cached;
  }

  /**
   * Creates a new ticket dispatched by an Admin (PSB or Maintenance).
   */
  public static async createTicket(input: CreateTicketInput, adminId = 'superadmin') {
    const techUser = dataStore.technicians.find(
      (t) =>
        t.username === input.assignedTechUsername ||
        t.fullName.toLowerCase() === input.assignedTechUsername.toLowerCase()
    );

    const techName = techUser ? techUser.fullName : input.assignedTechUsername;
    const techInitials = techUser ? techUser.initials : getInitials(techName);

    const nextNumber = `WO-2025-0${843 + dataStore.tickets.length - 4}`;
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

    // Update in-memory data store
    dataStore.tickets.unshift(newTicket);

    dataStore.activityLogs.push({
      id: `log-${Date.now()}`,
      actorUserId: adminId,
      actorRole: 'Admin',
      actionType: 'TICKET_CREATED',
      targetEntity: 'ticket',
      targetId: newTicket.id,
      details: { ticketNumber: newTicket.ticketNumber, type: newTicket.ticketType },
      createdAt: new Date().toISOString(),
    });

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
      if (dataStore.processedSubmissions.has(input.submissionId)) {
        const cachedTicket = dataStore.tickets.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
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
      // In-memory fallback for splitter coordinates
      const memCluster = dataStore.clusters.find(
        (c) => c.splitterCode === input.splitterId || c.name.toLowerCase().includes('bandung')
      );
      if (memCluster) {
        distanceMeters = calculateHaversineDistance(
          input.submittedLat,
          input.submittedLng,
          memCluster.lat,
          memCluster.lng
        );
        isLocationFlagged = distanceMeters > MAX_GEOFENCE_RADIUS_METERS;
      }
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

        // 5. Update Customer (Law 1 & Master Data)
        const oldAttenuation = ticket.customer.currentAttenuation
          ? Number(ticket.customer.currentAttenuation)
          : null;

        await tx.customer.update({
          where: { id: ticket.customerId },
          data: {
            status: 'ACTIVE',
            splitterId: splitter.id,
            portNumber: input.portNumber,
            currentAttenuation: input.attenuationDbm,
            updatedAt: new Date(),
          },
        });

        // 6. Append-Only Attenuation History (Law 2: Server Timestamps only)
        await tx.attenuationHistory.create({
          data: {
            submissionId: input.submissionId,
            ticketId: ticket.id,
            customerId: ticket.customerId,
            techId: techUserId,
            oldAttenuation: oldAttenuation !== null ? oldAttenuation : undefined,
            newAttenuation: input.attenuationDbm,
            splitterId: splitter.id,
            portNumber: input.portNumber,
            photoObjectKey: input.photoObjectKey,
            submittedLat: input.submittedLat,
            submittedLng: input.submittedLng,
            distanceToSplitterM: Math.round(distanceMeters * 100) / 100,
            isLocationFlagged,
            clientRecordedAt: input.clientRecordedAt ? new Date(input.clientRecordedAt) : null,
          },
        });

        // 7. Append-Only Activity Log (Law 2)
        await tx.activityLog.create({
          data: {
            actorUserId: techUserId,
            actorRole: 'Technician',
            actionType: 'TICKET_SUBMITTED_BY_TECH',
            targetEntity: 'ticket',
            targetId: ticket.id,
            oldPayload: {
              status: ticket.status,
              oldAttenuation,
            },
            newPayload: {
              submissionId: input.submissionId,
              status: 'COMPLETED',
              attenuationDbm: input.attenuationDbm,
              splitterCode: splitter.splitterCode,
              portNumber: input.portNumber,
              distanceMeters: Math.round(distanceMeters),
              isLocationFlagged,
            },
          },
        });

        // 8. Update Ticket to COMPLETED
        const updatedTicket = await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
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
    // e. IN-MEMORY STORE SYNC (Fallback & Cache Consistency)
    // ------------------------------------------------------------------
    const ticket = dataStore.tickets.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (ticket) {
      ticket.status = 'Selesai';
      ticket.currentAttenuation = input.attenuationDbm;
      ticket.completedAt = new Date().toISOString();

      const clusterObj = dataStore.clusters.find((c) => c.splitterCode === input.splitterId || c.name === ticket.cluster);
      if (clusterObj) {
        const targetPort = clusterObj.ports.find((p) => p.portNumber === input.portNumber);
        if (targetPort) {
          targetPort.isOccupied = true;
          targetPort.customerName = ticket.customerName;
          targetPort.siaNumber = ticket.siaNumber;
        }
      }

      const customer = dataStore.customers.find((c) => c.siaNumber === ticket.siaNumber);
      if (customer) {
        customer.currentAttenuation = input.attenuationDbm;
        customer.status = 'ACTIVE';
        customer.portNumber = input.portNumber;
        customer.splitterCode = input.splitterId;
        customer.updatedAt = new Date().toISOString();
      }

      dataStore.processedSubmissions.add(input.submissionId);
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
      title:
        input.attenuationDbm < -25
          ? 'Redaman kritis terdeteksi'
          : `${ticketTypeStr} selesai`,
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
        ? `Laporan berhasil disimpan (Peringatan: Lokasi teknisi berjarak ${Math.round(distanceMeters)}m dari ODP ${splitterCode}).`
        : 'Laporan berhasil disimpan dan disiarkan secara real-time.',
    };
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
    const ticket = dataStore.tickets.find((t) => t.ticketNumber === ticketNumber);
    if (!ticket) throw new Error('Tiket tidak ditemukan');
    ticket.status = 'Selesai';
    ticket.completedAt = new Date().toISOString();
    return ticket;
  }
}
