import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import { CustomerService } from '@/server/services/customer.service';
import { TechnicianService } from '@/server/services/technician.service';
import {
  requireAdminActor,
  matchesAssignedClusters,
  handleAdminRouteError,
} from '@/server/lib/admin-auth';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminActor(request, [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.CUSTOMER_READ,
      PERMISSIONS.NETWORK_READ,
    ]);
    const cluster = request.nextUrl.searchParams.get('cluster') || undefined;

    const [rawTickets, rawCustomers, rawTechs] = await Promise.all([
      TicketService.listTickets({ cluster }),
      CustomerService.listCustomers('', cluster || 'Semua cluster'),
      TechnicianService.listTechnicians('', cluster || 'Semua cluster'),
    ]);

    const tickets = rawTickets.filter((t) => matchesAssignedClusters(actor, t.cluster));
    const customers = rawCustomers.filter((c) =>
      matchesAssignedClusters(actor, c.clusterCode, c.cluster),
    );
    const techs = rawTechs.filter((t) => matchesAssignedClusters(actor, t.cluster));

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        stats: {
          customerCount: customers.length,
          technicianTotal: techs.length,
          technicianActive: techs.filter((t) => t.sessionStatus === 'ACTIVE_SESSION' || t.isActive)
            .length,
        },
      },
      meta: { count: tickets.length },
    });
  } catch (error: unknown) {
    return handleAdminRouteError(
      error,
      'OVERVIEW_FETCH_ERROR',
      ERROR_CODES.INTERNAL_ERROR,
    );
  }
}
