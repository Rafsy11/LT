import { NextRequest, NextResponse } from 'next/server';
import { TicketService } from '@/server/services/ticket.service';
import { CustomerService } from '@/server/services/customer.service';
import { TechnicianService } from '@/server/services/technician.service';

export async function GET(request: NextRequest) {
  try {
    const cluster = request.nextUrl.searchParams.get('cluster') || undefined;

    const [tickets, customerCount, techStats] = await Promise.all([
      TicketService.listTickets({ cluster }),
      CustomerService.getCustomerCount(),
      TechnicianService.getOverviewStats(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tickets,
        stats: {
          customerCount,
          technicianTotal: techStats.total,
          technicianActive: techStats.active,
        },
      },
      meta: { count: tickets.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat ringkasan operasional';
    return NextResponse.json(
      { success: false, error: { code: 'OVERVIEW_FETCH_ERROR', message } },
      { status: 500 },
    );
  }
}

