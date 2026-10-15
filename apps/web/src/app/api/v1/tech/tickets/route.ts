import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { dataStore } from '@/services/data-store';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const username = request.headers.get('x-username');
    const searchParams = request.nextUrl.searchParams;
    const queryTech = searchParams.get('tech');

    // 1. Resolve technician user
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

    // 2. Fetch active assigned tickets from Prisma DB
    let activeTickets: any[] = [];
    let clusterIds = new Set<string>();

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

      activeTickets = tickets.map((t) => {
        if (t.customer?.clusterId) clusterIds.add(t.customer.clusterId);
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
            currentAttenuation: t.customer.currentAttenuation ? Number(t.customer.currentAttenuation) : null,
            clusterName: t.customer.cluster?.name || 'Cluster',
            clusterCode: t.customer.cluster?.clusterCode || 'BDG',
            splitterCode: t.customer.splitter?.splitterCode || null,
            portNumber: t.customer.portNumber,
          },
        };
      });
    }

    // Fallback if DB empty or in-memory mock active
    if (activeTickets.length === 0) {
      const targetTech = username || queryTech || 'Andi Pratama';
      activeTickets = dataStore.tickets
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
          adminNotes: null,
          assignedAt: t.createdAt,
          createdAt: t.createdAt,
          customer: {
            id: t.siaNumber,
            siaNumber: t.siaNumber,
            fullName: t.customerName,
            address:
              dataStore.customers.find((c) => c.siaNumber === t.siaNumber)?.address ||
              'Jl. Riau No. 45, Bandung',
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

    // 3. Fetch ODP Splitters & port occupancy for related clusters
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
    } catch {
      // In-memory fallback
      splittersData = dataStore.clusters.map((c) => ({
        id: c.splitterCode,
        splitterCode: c.splitterCode,
        clusterName: c.name,
        clusterCode: 'BDG-01',
        lat: c.lat,
        lng: c.lng,
        maxPorts: c.ports.length,
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
