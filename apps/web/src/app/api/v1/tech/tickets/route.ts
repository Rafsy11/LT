import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable, markDatabaseUnavailable } from '@repo/database';
import { redisManager } from '@/server/lib/redis';
import { TicketService } from '@/server/services/ticket.service';
import { NetworkService } from '@/server/services/network.service';
import { ERROR_CODES } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    // 1. Instant Force Logout Check via Redis (Task 2 & Law 4)
    const deviceId = request.headers.get('x-device-id');
    if (deviceId) {
      const isBlacklisted = await redisManager.isSessionBlacklisted(deviceId);
      if (isBlacklisted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.SESSION_REVOKED,
              message:
                'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
            },
          },
          { status: 401 },
        );
      }
    }

    const userId = request.headers.get('x-user-id');
    const username = request.headers.get('x-username');
    const searchParams = request.nextUrl.searchParams;
    const queryTech = searchParams.get('tech');

    const dbOnline = await isDatabaseAvailable();

    // 2. Resolve technician user
    let techUser = null;
    if (dbOnline) {
      try {
        if (userId) {
          techUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { role: true },
          });
        } else if (username) {
          techUser = await prisma.user.findUnique({
            where: { username },
            include: { role: true },
          });
        } else if (queryTech) {
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
      adminNotes: string | null;
      assignedAt: string | null;
      createdAt: string;
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

    // 3. Fetch active assigned tickets from Prisma DB
    let activeTickets: MobileTicketDto[] = [];

    if (techUser && (await isDatabaseAvailable())) {
      try {
        const tickets = await prisma.ticket.findMany({
          where: {
            assignedTechId: techUser.id,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          include: {
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
          return {
            id: t.id,
            ticketNumber: t.ticketNumber,
            ticketType: t.ticketType,
            status: t.status,
            adminNotes: t.adminNotes,
            assignedAt: t.assignedAt?.toISOString() || null,
            createdAt: t.createdAt.toISOString(),
            customer: {
              id: t.customer.id,
              siaNumber: t.customer.siaNumber,
              fullName: t.customer.fullName,
              address: t.customer.address,
              lat: t.customer.lat ? Number(t.customer.lat) : null,
              lng: t.customer.lng ? Number(t.customer.lng) : null,
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

    // Fallback if DB empty or during mock dev
    if (activeTickets.length === 0) {
      const allTickets = await TicketService.listTickets();
      const targetTech = username || queryTech || 'Andi Pratama';
      activeTickets = allTickets
        .filter(
          (t) =>
            t.status !== 'Selesai' &&
            (t.assignedTech.toLowerCase().includes(targetTech.toLowerCase()) ||
              targetTech.toLowerCase().includes('andi')),
        )
        .map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          ticketType: t.ticketType === 'Maintenance' ? 'MAINTENANCE' : 'PSB',
          status: t.status === 'Dalam proses' ? 'IN_PROGRESS' : 'OPEN',
          adminNotes: t.adminNotes || null,
          assignedAt: t.createdAt,
          createdAt: t.createdAt,
          customer: {
            id: t.siaNumber,
            siaNumber: t.siaNumber,
            fullName: t.customerName,
            address: 'Jl. Riau No. 45, Bandung',
            lat: -6.914744,
            lng: 107.60981,
            currentAttenuation: t.currentAttenuation,
            attenuationHistory:
              typeof t.currentAttenuation === 'number' ? [t.currentAttenuation] : [],
            clusterName: t.cluster,
            clusterCode: 'BDG-01',
            splitterCode: 'ODP-BDG-01',
            portNumber: 3,
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
    const message =
      error instanceof Error ? error.message : 'Gagal memuat daftar tiket teknisi';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TECH_TICKETS_ERROR',
          message,
        },
      },
      { status: 500 },
    );
  }
}
