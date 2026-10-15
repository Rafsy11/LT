import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { redisManager } from '@/lib/redis';
import { TicketService } from '@/services/ticket.service';
import { NetworkService } from '@/services/network.service';
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
              message: 'Sesi perangkat Anda telah dicabut oleh Administrator (Force Logout). Silakan login kembali.',
            },
          },
          { status: 401 }
        );
      }
    }

    const userId = request.headers.get('x-user-id');
    const username = request.headers.get('x-username');
    const searchParams = request.nextUrl.searchParams;
    const queryTech = searchParams.get('tech');

    // 2. Resolve technician user
    let techUser = null;
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
          OR: [
            { username: queryTech },
            { fullName: { contains: queryTech, mode: 'insensitive' } },
          ],
        },
        include: { role: true },
      });
    }

    // 3. Fetch active assigned tickets from Prisma DB
    let activeTickets: any[] = [];

    if (techUser) {
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      activeTickets = tickets.map((t) => ({
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
          currentAttenuation: t.customer.currentAttenuation ? Number(t.customer.currentAttenuation) : null,
          clusterName: t.customer.cluster?.name || 'Cluster',
          clusterCode: t.customer.cluster?.clusterCode || 'BDG',
          splitterCode: t.customer.splitter?.splitterCode || null,
          portNumber: t.customer.portNumber,
        },
      }));
    }

    // Fallback if DB empty or during mock dev
    if (activeTickets.length === 0) {
      const allTickets = await TicketService.listTickets();
      const targetTech = username || queryTech || 'Andi Pratama';
      activeTickets = allTickets
        .filter(
          (t) =>
            t.status !== 'Selesai' &&
            (t.assignedTech.toLowerCase().includes(targetTech.toLowerCase()) || targetTech.toLowerCase().includes('andi'))
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
            clusterName: t.cluster,
            clusterCode: 'BDG-01',
            splitterCode: 'ODP-BDG-01',
            portNumber: 3,
          },
        }));
    }

    // 4. Fetch ODP Splitters & port occupancy for related clusters
    let splittersData: any[] = [];
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
    } catch {
      // Handled by NetworkService fallback
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
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TECH_TICKETS_ERROR',
          message: error.message || 'Gagal memuat daftar tiket teknisi',
        },
      },
      { status: 500 }
    );
  }
}
