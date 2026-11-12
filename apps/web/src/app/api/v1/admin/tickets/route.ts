import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { createTicketSchema, ERROR_CODES, PERMISSIONS, TicketQuery } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.TICKET_READ);
    const searchParams = request.nextUrl.searchParams;
    const cluster = searchParams.get('cluster') || undefined;
    const status = (searchParams.get('status') || undefined) as TicketQuery['status'];
    const query = searchParams.get('query') || undefined;

    const rawTickets = await TicketService.listTickets({ cluster, status, query });
    const tickets = rawTickets.filter((t) => matchesAssignedClusters(actor, t.cluster));

    return NextResponse.json({
      success: true,
      data: tickets,
      meta: { count: tickets.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(error, 'TICKET_FETCH_ERROR', 'Gagal memuat daftar tiket');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, PERMISSIONS.TICKET_CREATE);
    const body: unknown = await request.json();
    const validated = createTicketSchema.parse(body);

    if (!matchesAssignedClusters(actor, validated.clusterCode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: `Akses ditolak: Cluster "${validated.clusterCode}" berada di luar cakupan wilayah tugas Anda.`,
          },
        },
        { status: 403 },
      );
    }

    const ticket = await TicketService.createTicket(validated, actor.userId);

    return NextResponse.json(
      {
        success: true,
        data: ticket,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleAdminRouteError(error, ERROR_CODES.VALIDATION_ERROR, 'Gagal membuat tiket', 400);
  }
}
