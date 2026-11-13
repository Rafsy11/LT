import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { TicketService, DbTicketPendingSubmission } from '@/server/services/ticket.service';
import { NetworkService } from '@/server/services/network.service';
import {
  resolveTechActor,
  normalizeTechUsernameAlias,
  handleTechRouteError,
} from '@/server/lib/tech-auth';

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveTechActor(request);
    const searchParams = request.nextUrl.searchParams;
    const queryTech = searchParams.get('tech');
    const isSuperAdminViewer = actor.userType === 'SUPER_ADMIN' && !queryTech;

    const dbOnline = await isDatabaseAvailable();

    // 2. Resolve target technician user (strictly bound to actor unless SUPER_ADMIN views all)
    let techUser = null;
    if (dbOnline && !isSuperAdminViewer) {
      try {
        if (actor.userId) {
          techUser = await prisma.user.findUnique({
            where: { id: actor.userId },
            include: { role: true },
          });
        }
        if (!techUser && actor.canonicalUsername) {
          techUser = await prisma.user.findUnique({
            where: { username: actor.canonicalUsername },
            include: { role: true },
          });
        }
        if (!techUser && queryTech) {
          techUser = await prisma.user.findFirst({
            where: {
              OR: [{ username: queryTech }, { fullName: { contains: queryTech, mode: 'insensitive' } }],
            },
            include: { role: true },
          });
        }
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    interface MobileTicketDto {
      id: string;
      ticketNumber: string;
      ticketType: string;
      status: string;
      vendorName: string | null;
      complaintSummary: string | null;
      customerPhone: string | null;
      serviceAddress: string;
      locationPlace: string | null;
      targetLat: number | null;
      targetLng: number | null;
      adminNotes: string | null;
      rejectionReason: string | null;
      assignedAt: string | null;
      startedAt: string | null;
      createdAt: string;
      pendingSubmission: DbTicketPendingSubmission | null;
      customer: {
        id: string;
        siaNumber: string;
        fullName: string;
        address: string;
        lat: number | null;
        lng: number | null;
        currentAttenuation: number | null;
        attenuationHistory: number[];
        clusterName: string;
        clusterCode: string;
        splitterCode: string | null;
        portNumber: number | null;
      };
    }

    // 3. Fetch active & pending approval assigned tickets from Prisma DB
    let activeTickets: MobileTicketDto[] = [];

    if ((techUser || isSuperAdminViewer) && (await isDatabaseAvailable())) {
      try {
        const tickets = await prisma.ticket.findMany({
          where: {
            ...(techUser ? { assignedTechId: techUser.id } : {}),
            status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL'] },
          },
          include: {
            assignedTech: true,
            customer: {
              include: {
                cluster: true,
                splitter: true,
                attenuations: {
                  take: 5,
                  orderBy: { createdAt: 'desc' },
                  select: { newAttenuation: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        activeTickets = tickets.map((t) => {
          const hist = t.customer.attenuations.map((a) => Number(a.newAttenuation));
          const curAtt = t.customer.currentAttenuation
            ? Number(t.customer.currentAttenuation)
            : null;
          const pendingSubmission =
            t.pendingPayload && typeof t.pendingPayload === 'object'
              ? (t.pendingPayload as unknown as DbTicketPendingSubmission)
              : null;

          return {
            id: t.id,
            ticketNumber: t.ticketNumber,
            ticketType: t.ticketType,
            status: t.status,
            vendorName: t.vendorName || t.assignedTech?.vendorCompany || null,
            complaintSummary: t.complaintSummary || null,
            customerPhone: t.customerPhone || null,
            serviceAddress: t.serviceAddress || t.customer.address,
            locationPlace: t.locationPlace || null,
            targetLat:
              t.targetLat !== null && t.targetLat !== undefined
                ? Number(t.targetLat)
                : t.customer.lat !== null && t.customer.lat !== undefined
                  ? Number(t.customer.lat)
                  : null,
            targetLng:
              t.targetLng !== null && t.targetLng !== undefined
                ? Number(t.targetLng)
                : t.customer.lng !== null && t.customer.lng !== undefined
                  ? Number(t.customer.lng)
                  : null,
            adminNotes: t.adminNotes,
            rejectionReason: t.rejectionReason || null,
            assignedAt: (t.dispatchedAt || t.assignedAt)?.toISOString() || null,
            startedAt: t.startedAt?.toISOString() || null,
            createdAt: t.createdAt.toISOString(),
            pendingSubmission,
            customer: {
              id: t.customer.id,
              siaNumber: t.customer.siaNumber,
              fullName: t.customer.fullName,
              address: t.serviceAddress || t.customer.address,
              lat:
                t.targetLat !== null && t.targetLat !== undefined
                  ? Number(t.targetLat)
                  : t.customer.lat
                    ? Number(t.customer.lat)
                    : null,
              lng:
                t.targetLng !== null && t.targetLng !== undefined
                  ? Number(t.targetLng)
                  : t.customer.lng
                    ? Number(t.customer.lng)
                    : null,
              currentAttenuation: curAtt,
              attenuationHistory: hist.length > 0 ? hist : curAtt !== null ? [curAtt] : [],
              clusterName: t.customer.cluster?.name || 'Cluster',
              clusterCode: t.customer.cluster?.clusterCode || 'BDG',
              splitterCode: t.customer.splitter?.splitterCode || null,
              portNumber: t.customer.portNumber,
            },
          };
        });
      } catch (err) {
        markDatabaseUnavailable(err);
      }
    }

    // Fallback if DB empty or offline
    if (activeTickets.length === 0) {
      const allTickets = await TicketService.listTickets();
      const targetUser = normalizeTechUsernameAlias(queryTech || actor.username);
      const targetFullName = (actor.fullName || '').trim().toLowerCase();

      activeTickets = allTickets
        .filter((t) => {
          if (t.status === 'Selesai') return false;
          if (isSuperAdminViewer) return true;

          const ticketTechUser = normalizeTechUsernameAlias(
            t.assignedTechUsername || t.assignedTech.toLowerCase().replace(/\s+/g, '.'),
          );
          const ticketTechName = t.assignedTech.toLowerCase();

          return (
            ticketTechUser === targetUser ||
            (targetFullName.length > 0 && ticketTechName === targetFullName) ||
            ticketTechName.includes(targetUser.replace('.', ' '))
          );
        })
        .map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          ticketType:
            t.ticketType === 'Maintenance' || t.ticketType === 'Perbaikan'
              ? 'MAINTENANCE'
              : 'PSB',
          status:
            t.status === 'Menunggu verifikasi'
              ? 'PENDING_APPROVAL'
              : t.status === 'Dalam proses'
                ? 'IN_PROGRESS'
                : 'OPEN',
          vendorName: t.vendorName || null,
          complaintSummary: t.complaintSummary || null,
          customerPhone: t.customerPhone || null,
          serviceAddress: t.serviceAddress || 'Alamat belum tercantum',
          locationPlace: t.locationPlace || null,
          targetLat: t.targetLat ?? null,
          targetLng: t.targetLng ?? null,
          adminNotes: t.adminNotes || null,
          rejectionReason: t.rejectionReason || null,
          assignedAt: t.dispatchedAt || t.createdAt,
          startedAt: t.startedAt || null,
          createdAt: t.createdAt,
          pendingSubmission: t.pendingSubmission || null,
          customer: {
            id: t.siaNumber,
            siaNumber: t.siaNumber,
            fullName: t.customerName,
            address: t.serviceAddress || 'Alamat belum tercantum',
            lat: t.targetLat ?? -6.914744,
            lng: t.targetLng ?? 107.60981,
            currentAttenuation: t.currentAttenuation,
            attenuationHistory:
              typeof t.currentAttenuation === 'number' ? [t.currentAttenuation] : [],
            clusterName: t.cluster,
            clusterCode: t.clusterCode || 'BDG-01',
            splitterCode: t.splitterCode || null,
            portNumber: t.portNumber ?? null,
          },
        }));
    }

    // 4. Fetch ODP Splitters & port occupancy for related clusters
    interface SplitterDto {
      id: string;
      splitterCode: string;
      clusterName: string;
      clusterCode: string;
      lat: number;
      lng: number;
      maxPorts: number;
      occupiedPorts: number[];
      availablePorts: number[];
    }
    let splittersData: SplitterDto[] = [];
    if (await isDatabaseAvailable()) {
      try {
        const splitters = await prisma.networkSplitter.findMany({
          include: {
            cluster: true,
            customers: {
              where: { status: 'ACTIVE' },
              select: { portNumber: true, fullName: true, siaNumber: true },
            },
          },
        });

        if (splitters.length > 0) {
          splittersData = splitters.map((s) => {
            const occupiedPorts = s.customers
              .map((c) => c.portNumber)
              .filter((p): p is number => p !== null);

            const availablePorts: number[] = [];
            for (let p = 1; p <= s.maxPorts; p++) {
              if (!occupiedPorts.includes(p)) {
                availablePorts.push(p);
              }
            }

            return {
              id: s.id,
              splitterCode: s.splitterCode,
              clusterName: s.cluster?.name || 'Cluster',
              clusterCode: s.cluster?.clusterCode || 'BDG',
              lat: Number(s.lat),
              lng: Number(s.lng),
              maxPorts: s.maxPorts,
              occupiedPorts,
              availablePorts,
            };
          });
        }
      } catch (err) {
        markDatabaseUnavailable(err);
        // Handled by NetworkService fallback
      }
    }

    if (splittersData.length === 0) {
      const clusters = await NetworkService.listClusters();
      splittersData = clusters.map((c) => ({
        id: c.splitterCode,
        splitterCode: c.splitterCode,
        clusterName: c.name,
        clusterCode: c.clusterCode,
        lat: c.lat,
        lng: c.lng,
        maxPorts: c.maxPorts,
        occupiedPorts: c.ports.filter((p) => p.isOccupied).map((p) => p.portNumber),
        availablePorts: c.ports.filter((p) => !p.isOccupied).map((p) => p.portNumber),
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        tickets: activeTickets,
        splitters: splittersData,
      },
      meta: {
        activeTicketsCount: activeTickets.length,
        splittersCount: splittersData.length,
      },
    });
  } catch (error: unknown) {
    return handleTechRouteError(
      error,
      'TECH_TICKETS_ERROR',
      'Gagal memuat daftar tiket vendor',
      500,
    );
  }
}
